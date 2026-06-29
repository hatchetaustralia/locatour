/**
 * LocationProvider — ONE shared GPS watch + ONE located-locations fetch + the
 * hidden-spot-nearby readout for the whole (tabs) group.
 *
 * Why it exists: home, map and camera each used to run their own GPS watch AND
 * re-fetch the located slice (storage.getLocations hits the API every time coords
 * are passed) on mount / focus / first fix. Navigating between tabs re-polled all
 * of it. Mounted once at the tab-group boundary, this provider keeps the watch +
 * slice alive across tab switches so screens read it instantly — fewer network
 * round-trips, lower battery, and a single source of truth for "something hidden
 * nearby" (so the distance is consistent + live everywhere).
 *
 * Requests foreground ("while using") location on mount — so simply opening the
 * tab group (map/home) prompts for GPS if it isn't granted yet. (Existing accounts
 * skip onboarding on a fresh install, so this is the only place that asks; the
 * opt-in Nearby Alerts flow separately requests BACKGROUND location.) The camera
 * keeps its OWN high-accuracy watch for check-in proximity gating; it only reads
 * the shared locations/level/visited/unlocked + hidden readout from here.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

import { storage } from '@/utils/storage';
import { fetchAccountState } from '@/utils/account';
import { hydrateFromCache, fetchAndApplyConfig } from '@/utils/runtime-config';
import { findNearestHiddenSpot, HiddenNearby } from '@/utils/hidden-detection';
import { User, ExploreLocation, Coordinates } from '@/types';

// How long a located slice is considered fresh. Within this window a focus or a
// duplicate mount reuses the in-memory slice instead of issuing a new located API
// round-trip. Re-fetch happens past this window, on the first GPS fix, or via the
// explicit refresh() called after a check-in/unlock.
const STALE_MS = 60_000;

interface LocationContextValue {
  userLocation: Location.LocationObject | null;
  userCoords: { latitude: number; longitude: number } | null;
  activeCoords: { latitude: number; longitude: number } | null;
  locating: boolean;
  permissionGranted: boolean;

  reachable: ExploreLocation[];
  user: User | null;
  level: number;
  unlockedIds: Set<string>;
  visitedIds: Set<string>;
  locationsLoading: boolean;

  nearestHidden: HiddenNearby | null;
  hiddenDistanceM: number | null;
  hiddenWarm: boolean;
  hiddenInRange: boolean;

  refresh: (opts?: { force?: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
  forceFreshFix: () => Promise<{ latitude: number; longitude: number } | null>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  // — Position state —
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [locating, setLocating] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // — Locations / user state —
  const [user, setUser] = useState<User | null>(storage.getCachedUser());
  const [reachable, setReachable] = useState<ExploreLocation[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(
    () => new Set(storage.getUnlockedLocationIds()),
  );
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [locationsLoading, setLocationsLoading] = useState(true);

  // — Refs for fetch coordination —
  const lastFetchAt = useRef(0);
  const fetching = useRef(false);
  const lastFixCoords = useRef<Coordinates | null>(null);
  const syncedFirstFix = useRef(false); // re-fetch the located slice only on the FIRST fix

  const level = user?.stats.currentLevel ?? 1;

  // The distance reference: live GPS first, else the user's home base so lists
  // order sensibly before the first fix lands.
  const userCoords = useMemo(
    () =>
      userLocation
        ? { latitude: userLocation.coords.latitude, longitude: userLocation.coords.longitude }
        : null,
    [userLocation],
  );
  const activeCoords = userCoords ?? user?.homeCoordinates ?? null;

  // Core located fetch. `coords` present → fresh located slice; absent → the
  // (cheap) cached path. Always refreshes user + visited + unlocked so the
  // detector inputs stay consistent with the slice.
  const doFetch = useCallback(async (coords: Coordinates | null) => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const u = await storage.getUser();
      if (u) setUser(u);
      const lvl = u?.stats.currentLevel ?? 1;
      const home = coords ?? u?.homeCoordinates ?? null;
      const slice = home
        ? await storage.getLocations({ latitude: home.latitude, longitude: home.longitude, level: lvl })
        : await storage.getLocations({ level: lvl });
      setReachable(slice);
      const checkIns = await storage.getCheckIns();
      setVisitedIds(new Set(checkIns.map((c) => c.locationId)));
      setUnlockedIds(new Set(storage.getUnlockedLocationIds()));
      // Only a COORDINATE-anchored fetch counts as a "fresh located slice".
      // With no GPS fix AND no home base, `home` is null and we fetched the
      // bundled/cached highlights (always-visible majors), NOT the user's local
      // slice — so we must NOT stamp lastFetchAt. Otherwise the first real GPS
      // fix's re-fetch (gated on STALE_MS below) and refresh() (gated on 2s) get
      // suppressed and the map shows only majors forever. (Bug: a user who
      // skipped the onboarding home-base step saw only major spots near them in
      // Yanchep, never the local tier-1 ones.)
      if (home) lastFetchAt.current = Date.now();
    } catch {
      // Keep whatever slice we already have (cached/bundled).
    } finally {
      fetching.current = false;
      setLocationsLoading(false);
    }
  }, []);

  // Public refresh: force-fresh past the staleness debounce, used after a
  // check-in/unlock. Re-reads unlocked/visited even if the slice is fresh, so a
  // newly unlocked hidden spot folds out of "hidden" immediately.
  //
  // refresh({ force: true }) is the post-check-in path the camera awaits: it
  // BYPASSES the 2s freshness guard and re-syncs the located slice AND the
  // server's authoritative unlocked/visited state, so a brand-new unlock lands on
  // the map/profile immediately instead of after a full restart. Zero-arg
  // refresh() keeps the freshness-guarded behaviour unchanged.
  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    if (opts?.force) {
      // Authoritative pull of the server's check-ins + unlocks (/account/me).
      // applyServerState REPLACES local state (keeping only un-synced offline
      // check-ins), so an admin revoke / un-discovered spot DISAPPEARS here
      // instead of lingering until a cold restart — and a brand-new unlock still
      // lands immediately. doFetch below re-derives the visited/unlocked context
      // sets from the now-authoritative storage.
      const state = await fetchAccountState();
      if (state) await storage.applyServerState(state.checkIns, state.unlockedIds);
      // Force getLocations() to re-hit the server rather than return the stale
      // in-memory slice.
      storage.invalidateLocations();
      await doFetch(lastFixCoords.current);
      return;
    }
    const fresh = Date.now() - lastFetchAt.current < 2_000;
    if (!fresh) {
      await doFetch(lastFixCoords.current);
    } else {
      const checkIns = await storage.getCheckIns();
      setVisitedIds(new Set(checkIns.map((c) => c.locationId)));
      setUnlockedIds(new Set(storage.getUnlockedLocationIds()));
    }
  }, [doFetch]);

  // Re-read the current user from storage into context state — call after an
  // in-app profile/avatar change so the nav + map (which both read context.user)
  // reflect it immediately instead of only after a cold restart.
  const refreshUser = useCallback(async () => {
    const u = await storage.getUser();
    if (u) setUser(u);
  }, []);

  // One-shot authoritative fix for the camera's check-in proof — a FRESH
  // high-accuracy reading, never the ambient cached value.
  const forceFreshFix = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    // Keep the located-fetch key (lastFixCoords) in sync with this authoritative
    // fresh fix so a follow-up refresh()/doFetch re-centers the slice on it
    // rather than a stale value (or, for a user with no home base, nothing).
    lastFixCoords.current = coords;
    return coords;
  }, []);

  // — Authoritative resync on app OPEN + every return to FOREGROUND. Pulls the
  //   server's check-ins + unlocks so admin-side changes (a revoked check-in /
  //   un-discovered spot) and other out-of-app edits reflect on next open without
  //   a cold restart. Throttled so rapid background↔foreground flips don't hammer
  //   the API. fetchAccountState fail-soft (offline / signed-out → no-op). —
  useEffect(() => {
    let lastSyncAt = 0;
    const sync = () => {
      if (Date.now() - lastSyncAt < 10_000) return;
      lastSyncAt = Date.now();
      void refresh({ force: true });
    };
    sync(); // on mount — covers a returning user who didn't re-sign-in
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });
    return () => sub.remove();
  }, [refresh]);

  // — Server-controlled gameplay settings: hydrate the last cached values, then
  //   refresh from GET /api/config. Fire-and-forget; never blocks render. Until
  //   this lands, getConfig() returns the hard-coded defaults, so behaviour is
  //   unchanged for a cold offline launch. —
  useEffect(() => {
    void (async () => {
      await hydrateFromCache();
      await fetchAndApplyConfig();
    })();
  }, []);

  // — Initial located seed (mount), keyed off home base. Cheap, instant lists. —
  useEffect(() => {
    void doFetch(null);
  }, [doFetch]);

  // — ONE GPS watch: last-known seed + watchPositionAsync. Requests foreground
  //   permission on mount (prompts once if undetermined). Camera keeps its own. —
  useEffect(() => {
    let watchSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    const onFix = (loc: Location.LocationObject) => {
      if (cancelled) return;
      lastFixCoords.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(loc);
      setLocating(false);
      // Re-sync the located slice ONCE on the first real fix, then only update
      // coords on later fixes (no per-10m re-fetch).
      if (!syncedFirstFix.current) {
        syncedFirstFix.current = true;
        if (Date.now() - lastFetchAt.current > STALE_MS) {
          void doFetch(lastFixCoords.current);
        }
      }
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setPermissionGranted(false);
          setLocating(false);
          return;
        }
        setPermissionGranted(true);
        const last = await Location.getLastKnownPositionAsync();
        if (last && !cancelled) onFix(last);
        watchSub = await Location.watchPositionAsync(
          // Real-time foreground tracking so the distance readout ticks down ~every
          // second as the explorer walks, instead of jumping every ~10m. (Matches
          // the camera's own watch.) distanceInterval:0 = no movement gate; report
          // on the timeInterval. The located re-fetch is still first-fix-only, so
          // this adds NO extra network — just smoother coords.
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0, timeInterval: 1000 },
          (loc) => onFix(loc),
        );
        if (cancelled) {
          watchSub.remove();
          watchSub = null;
        }
      } catch {
        if (!cancelled) setLocating(false);
      }
    })();

    return () => {
      cancelled = true;
      watchSub?.remove();
    };
  }, [doFetch]);

  // — Hidden detection: single source of truth, live off coords + slice + ids. —
  // Hidden detection runs off LIVE GPS only (userCoords), never the home fallback:
  // a "something hidden nearby" readout derived from your home base would be wrong
  // (it can't tick down as you walk, and would stick ON if home sits inside a
  // hidden spot's warm ring). activeCoords/home stays for list ordering only.
  const nearestHidden = useMemo(
    () =>
      userCoords
        ? findNearestHiddenSpot(userCoords, reachable, level, { visitedIds, unlockedIds })
        : null,
    [userCoords, reachable, level, visitedIds, unlockedIds],
  );

  const value = useMemo<LocationContextValue>(
    () => ({
      userLocation,
      userCoords,
      activeCoords,
      locating,
      permissionGranted,
      reachable,
      user,
      level,
      unlockedIds,
      visitedIds,
      locationsLoading,
      nearestHidden,
      hiddenDistanceM: nearestHidden?.distanceM ?? null,
      hiddenWarm: nearestHidden?.warm === true,
      hiddenInRange: nearestHidden?.inRange === true,
      refresh,
      refreshUser,
      forceFreshFix,
    }),
    [
      userLocation,
      userCoords,
      activeCoords,
      locating,
      permissionGranted,
      reachable,
      user,
      level,
      unlockedIds,
      visitedIds,
      locationsLoading,
      nearestHidden,
      refresh,
      refreshUser,
      forceFreshFix,
    ],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationContext(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationContext must be used within a LocationProvider');
  return ctx;
}
