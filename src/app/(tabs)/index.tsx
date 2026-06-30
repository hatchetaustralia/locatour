import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Pressable,
  Platform,
  Dimensions,
  FlatList,
  ScrollView,
  Animated,
  ActivityIndicator,
  Modal,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandText } from '@/components/brand';
import { HiddenNearbyBar } from '@/components/hidden-nearby-bar';
import { RainbowGlowMarker } from '@/components/rainbow-glow-marker';
import { useUserAvatarMarker } from '@/components/user-avatar-marker';
import { SuggestLocationSheet } from '@/components/suggest-location-sheet';
import { Brand, Spacing, stampBorder, BrandRadius } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { submitSuggestion, fetchAnnouncement, recordUnlock } from '@/utils/account';
import { unlockedTier, levelForTier, rarityForTier } from '@/utils/leveling';
import { getConfig, tierRadiusBoost } from '@/utils/runtime-config';
import { useLocationContext } from '@/context/location-context';
import { formatDistance, openDirections, isWithinVicinity } from '@/utils/geo';
import { avatarUri } from '@/utils/avatar';
import { ExploreLocation, CheckIn, Coordinates, LocationCategory } from '@/types';

// Native Map imports (conditionally rendered)
let MapView: any = null;
let Marker: any = null;
let Circle: any = null;
if (Platform.OS !== 'web') {
  try {
    const RNMaps = require('react-native-maps');
    MapView = RNMaps.default;
    Marker = RNMaps.Marker;
    Circle = RNMaps.Circle;
  } catch (e) {
    console.error('Failed to import react-native-maps', e);
  }
}

// You must be within this many metres of a spot to suggest it (mirrors the
// server's 150m enforcement; the client pre-check just saves a round-trip).
const SUGGEST_RADIUS_M = 150;

// Canonical map categories (mirrors LocationCategory in types) + their display
// labels. The filter chips REUSE the map's own getPinColor/getCategoryIcon so a
// chip looks exactly like the pin it toggles. "food" was retired, so only the
// two live categories are offered; the catch-all "other" is folded into Parks /
// Scenic — an unknown category still shows whenever ALL chips are on (default).
const CATEGORY_FILTERS: { key: LocationCategory; label: string }[] = [
  { key: 'parks', label: 'Parks' },
  { key: 'scenic', label: 'Scenic' },
];

// POI label NOISE we never want on either basemap (schools — e.g. the beach
// primary school — shops, clinics, government, places of worship, transit). The
// outdoorsy ones (parks, attractions, natural features) stay visible so real
// Google places the explorer recognises remain on the map.
const HIDE_POI_NOISE = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
];

// Standard skin — warm cream/paper tones + the POI noise filter (so parks +
// attractions stay, unlike the old blanket `poi: off` that hid everything).
const LIGHT_MAP_STYLE = [
  ...HIDE_POI_NOISE,
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#FCF0E8' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#dcefdf' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#bfe6e9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#fffdfb' }] },
  // Soften airports: man-made land + building fills render dark navy by default;
  // tint them a light warm grey for a paper look.
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#EAE3DB' }] },
];

// Satellite/hybrid — keep Google's imagery + labels, but filter the SAME POI
// noise so the school/shop clutter doesn't reappear over the photo basemap.
const SATELLITE_MAP_STYLE = HIDE_POI_NOISE;

// Great-circle distance (metres) between two arbitrary points. Used by the
// suggest-a-location flow to gate on the user's CURRENT GPS vs the picked spot
// (getDistanceToLocation is bound to userLocation; this takes both points).
const haversineMeters = (a: Coordinates, b: Coordinates) => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000; // Earth radius in metres
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};

// "3rd March 2024" style date — matches the Previous Check-ins design.
const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  const month = d.toLocaleString(undefined, { month: 'long' });
  return `${day}${suffix} ${month} ${d.getFullYear()}`;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const searchParams = useLocalSearchParams<{ selectedId?: string }>();

  // Shared location + located slice + hidden-spot-nearby readout — ONE GPS watch +
  // ONE located fetch for the whole tab group (see LocationProvider). `reachable`
  // is the UNFILTERED slice (same as the map's old `locations`). The map keeps its
  // own screen state below (selection, avatar paint, heading).
  const {
    user,
    userLocation,
    reachable,
    level: userLevel,
    unlockedIds,
    visitedIds,
    nearestHidden,
    hiddenDistanceM,
    hiddenInRange,
    locationsLoading,
    refresh,
    forceFreshFix,
  } = useLocationContext();
  // True while the map is acquiring a FRESH fix on open (drives the loading bar
  // and stops the camera from settling on the stale last-known/base position).
  const [locatingMap, setLocatingMap] = useState(Platform.OS !== 'web');

  // Single open-app loader: ONE centre card covering both "finding you" (a fresh
  // GPS fix) and "loading nearby spots", shown once on open then auto-dismissed.
  // Replaces the old split UI (top sweep bar + separate "Locating you…" pill) that
  // flashed over each other. `initialLoadComplete` latches true the first time both
  // finish, so later background refreshes never re-show it.
  const gpsReady = !locatingMap && !!userLocation;
  const spotsReady = !locationsLoading;
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  useEffect(() => {
    if (initialLoadComplete || Platform.OS === 'web') return;
    if (gpsReady && spotsReady) {
      // Hold ~0.7s so both green ticks are visible before the card fades out.
      const t = setTimeout(() => setInitialLoadComplete(true), 700);
      return () => clearTimeout(t);
    }
  }, [gpsReady, spotsReady, initialLoadComplete]);
  const [selectedLoc, setSelectedLoc] = useState<ExploreLocation | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  // "You're at X — check in?" arrival prompt: the nearest checkable spot you've
  // walked within range of. Dismissed-id ref re-arms only after you leave.
  const [arrivalSpot, setArrivalSpot] = useState<ExploreLocation | null>(null);
  const dismissedArrivalRef = useRef<string | null>(null);
  // The "you are here" avatar is rendered as a plain React Native overlay <View>
  // ON TOP of the MapView (a sibling drawn after it), NOT a react-native-maps
  // Marker. It's positioned by projecting the user's coordinate to a screen pixel
  // (see avatarScreenPos / projectAvatar). A normal View is never snapshotted to a
  // bitmap the way a custom Marker child is, so the avatar can't go white on a cold
  // map load or vanish after a tab switch — the two long-standing marker bugs. The
  // only state is the failure fallback: if the remote image errors, show a person
  // icon so the ring always shows something — never an empty ring.
  const [avatarFailed, setAvatarFailed] = useState(false);
  // Screen-pixel position of the user's coordinate, from mapRef.pointForCoordinate.
  // Drives the absolutely-positioned avatar overlay; null until the map projects it,
  // and reset to null while the user's coordinate is off the visible map.
  const [avatarScreenPos, setAvatarScreenPos] = useState<{ x: number; y: number } | null>(null);
  // Live map heading (degrees) — drives the compass rose's north needle.
  const [mapHeading, setMapHeading] = useState(0);
  const [visitedLogs, setVisitedLogs] = useState<CheckIn[]>([]);
  // The live announcement banner is SERVER-DRIVEN (admin-managed). Null = nothing
  // to show. Dismiss hides it for this session; it returns on the next fetch if
  // still live (and not re-dismissed).
  const [announcement, setAnnouncement] = useState<{ id: number; title?: string | null; body: string } | null>(null);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  // Standard vs satellite (hybrid) basemap. Online-only for now; offline tiles
  // are a future MapLibre migration (see docs/locatour/02-map-stack-decision.md).
  const [satellite, setSatellite] = useState(false);

  // Category filter (client-side, over the SHARED located slice — no extra fetch
  // or GPS watch). Defaults to ALL categories selected so the map is unchanged
  // until the user narrows it. `filterOpen` toggles the chip sheet.
  const [activeCategories, setActiveCategories] = useState<Set<LocationCategory>>(
    () => new Set(CATEGORY_FILTERS.map((c) => c.key))
  );
  const [filterOpen, setFilterOpen] = useState(false);
  // True only while some (but possibly not all) categories are hidden — drives
  // the active dot on the filter FAB so the user knows a filter is on.
  const filterActive = activeCategories.size < CATEGORY_FILTERS.length;
  const toggleCategory = (key: LocationCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Never let the user hide EVERYTHING — the last selected chip stays on,
        // so the map can't go fully blank (an empty-map dead end).
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  // Captured ONCE at mount (synchronously) so the very first paint can already be
  // centred on home; null on a cold start before the profile finished loading.
  const initialHome = useRef(storage.getCachedUser()?.homeCoordinates ?? null).current;
  // The user's base/home coordinates (geocoded from their suburb at onboarding).
  // Warm-starts the map at home so it doesn't flash a broad default set and then
  // narrow once GPS resolves. Seeded synchronously from initialHome so the very
  // first render's vicinity filter already uses it; GPS takes over once it arrives.
  const [homeCoords, setHomeCoords] = useState<Coordinates | null>(initialHome);

  // Community "Suggest a location" flow (#2). A POI tap or long-press picks a
  // spot that isn't on Locatour yet and opens the sheet; the user confirms a name
  // (+ notes) and submits while standing near it. The server re-checks proximity.
  const [suggestCoord, setSuggestCoord] = useState<Coordinates | null>(null);
  const [suggestName, setSuggestName] = useState('');
  const [suggestVisible, setSuggestVisible] = useState(false);
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [suggestSubmitted, setSuggestSubmitted] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const mapRef = useRef<any>(null);
  // Live pixel size of the MapView (from onLayout) — lets projectAvatar hide the
  // avatar overlay once the user's coordinate projects off the visible map.
  const mapSizeRef = useRef<{ width: number; height: number } | null>(null);
  // Guard so we only auto-center on the very first location fix.
  const didCenterRef = useRef(false);
  // Map-ready gating: a fresh GPS fix can resolve BEFORE the native map has laid
  // out, and react-native-maps silently drops an animateToRegion issued before
  // then (so the camera would stay stuck on the base initialRegion). Stash the
  // target and flush it from onMapReady so the zoom is never lost.
  const mapReady = useRef(false);
  const pendingCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const centerOnUser = useCallback((target: { latitude: number; longitude: number }) => {
    const region = {
      latitude: target.latitude,
      longitude: target.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
    if (mapReady.current && mapRef.current) {
      mapRef.current.animateToRegion(region, 600);
    } else {
      pendingCenterRef.current = target; // onMapReady will flush this
    }
  }, []);

  // Drag-to-dismiss for the detail sheet: dragging anywhere on the card down
  // past a threshold slides it away and clears the selection (a native
  // bottom-sheet feel). We only claim the gesture when the inner ScrollView is
  // at the very top, so scrolling tall content still works normally.
  // Start off-screen (not 0) so the card never paints seated for a frame before
  // the entrance animation drives it up from the bottom.
  const translateY = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  // The dim backdrop is animated SEPARATELY from the card. The Modal uses
  // animationType="none" and we drive both ourselves so dismiss SLIDES the card
  // down while the backdrop FADES out — instead of the whole window (incl. the
  // backdrop's hard top edge) sliding down together, which looked junky.
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const SHEET_CLOSED_Y = Dimensions.get('window').height;

  // Animate the sheet OUT (card slides down + backdrop fades), THEN unmount.
  // Shared by the drag-dismiss, the backdrop tap, and the Android back button.
  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHEET_CLOSED_Y, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setSelectedLoc(null);
    });
  }, [translateY, backdropOpacity, SHEET_CLOSED_Y]);

  // Drag-to-dismiss MUST use react-native-gesture-handler, not PanResponder: the
  // sheet lives inside a React Native <Modal>, which on Android is a separate
  // native window where PanResponder move events don't propagate (taps still do —
  // that's why the backdrop-tap close kept working but the drag didn't). We keep
  // the RN Animated.Value and drive it from the gesture on the JS thread via
  // runOnJS(true). The gesture activates only on a downward drag, and only while
  // the inner ScrollView is at the top, so scrolling tall content still works.
  const [sheetScrollAtTop, setSheetScrollAtTop] = useState(true);
  const sheetDrag = Gesture.Pan()
    .enabled(sheetScrollAtTop)
    .activeOffsetY(8)
    .failOffsetY(-8)
    .runOnJS(true)
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.setValue(e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 110) {
        // Past the threshold → animate the rest of the way out from where the
        // finger left the card, fading the backdrop as it goes.
        closeSheet();
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      }
    });

  // Animate the sheet IN whenever it opens (marker tap, deep-link, or hidden-reach
  // auto-open): card springs up from the bottom while the backdrop fades in — the
  // symmetric counterpart to closeSheet.
  useEffect(() => {
    if (selectedLoc) {
      translateY.setValue(SHEET_CLOSED_Y);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [selectedLoc, translateY, backdropOpacity, SHEET_CLOSED_Y]);

  // Initial data load
  // Screen-local seed from the shared user: the avatar for the "you are here"
  // marker, the home base (vicinity fallback), and the check-in log for the detail
  // sheet. Location, the located slice, and hidden detection come from the
  // LocationProvider now (one watch + one fetch for the whole tab group).
  useEffect(() => {
    if (user) {
      setUserAvatar(avatarUri(user.avatarUrl, user.username));
      if (user.homeCoordinates) setHomeCoords(user.homeCoordinates);
    }
    storage.getCheckIns().then(setVisitedLogs).catch(() => {});
  }, [user]);

  // On first open: keep the loader up while we get a FRESH high-accuracy fix
  // (NOT the stale last-known/base seed the provider hands out instantly), then
  // zoom the camera to the user's real position. We also kick a located refresh so
  // the spots shown are within the radius around where they actually are. Falls
  // back to the last-known fix and is time-boxed so the loader can never hang.
  useEffect(() => {
    if (Platform.OS === 'web' || didCenterRef.current) return;
    didCenterRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await Promise.race([
          forceFreshFix().catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
        ]);
        if (cancelled) return;
        // Fresh fix preferred; else a LIVE last-known reading (read here, not from
        // the mount-time userLocation closure which is still null on a cold open).
        let target = fresh;
        if (!target) {
          const last = await Location.getLastKnownPositionAsync().catch(() => null);
          if (cancelled) return;
          target = last
            ? { latitude: last.coords.latitude, longitude: last.coords.longitude }
            : null;
        }
        if (target) {
          centerOnUser(target); // flushes via onMapReady if the map isn't laid out yet
          // Pull the located slice for this radius (the provider also fetches on its
          // first fix; this covers the case where the fresh fix moved us). Await it so
          // the loader stays up until nearby spots are actually loaded, not just GPS.
          await refresh();
        }
      } finally {
        // Always clear the loader — never leave the map stuck on "Locating you…".
        if (!cancelled) setLocatingMap(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Once, on first open. forceFreshFix/refresh/centerOnUser are stable; the
    // last-known fallback is read live inside, so no reactive deps are needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: open a spot's sheet when navigated with ?selectedId, once the
  // shared slice has loaded. Guarded by id so a later `reachable` refresh (e.g. on
  // focus) never re-opens a sheet the user already dismissed.
  const handledSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = searchParams.selectedId;
    if (!id || !reachable.length || handledSelectedIdRef.current === id) return;
    handledSelectedIdRef.current = id;
    const found = reachable.find((l) => l.id === id);
    if (found) setSelectedLoc(found);
  }, [searchParams.selectedId, reachable]);

  // On focus, re-read unlocked/visited (cheap, debounced in the provider) so a
  // spot just unlocked on the camera folds out of "hidden" the moment we return.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      // Pull the admin-managed announcement (null = show nothing).
      fetchAnnouncement().then(setAnnouncement).catch(() => {});
    }, [refresh])
  );

  // Whenever a spot is opened (via a marker tap or a deep-link selectedId),
  // glide the camera to it and nudge it upward so the pin sits clear above the
  // detail sheet (which covers the lower portion of the screen).
  useEffect(() => {
    if (!selectedLoc || Platform.OS === 'web' || !mapRef.current) return;
    const latitudeDelta = 0.02;
    mapRef.current.animateToRegion(
      {
        // Centre well south of the pin so it renders high, clear above the sheet.
        latitude: selectedLoc.coordinates.latitude - latitudeDelta * 0.3,
        longitude: selectedLoc.coordinates.longitude,
        latitudeDelta,
        longitudeDelta: latitudeDelta,
      },
      450
    );
  }, [selectedLoc]);

  // Reset the person-icon fallback whenever the avatar URL changes, so a fresh
  // avatar gets a clean chance to load before we'd fall back to the icon. The
  // overlay <Image> paints normally now (no marker bitmap snapshot), so there's no
  // blank-ring hang to backstop — only a hard load error trips the fallback.
  useEffect(() => {
    setAvatarFailed(false);
  }, [userAvatar]);

  // Project the user's coordinate to a screen pixel so the avatar overlay can be
  // positioned over the map. Because the overlay is a plain RN View (never a
  // snapshotted marker bitmap), it can't go white or freeze — we just re-run this
  // projection on every map ready / region / location / layout change. Guarded
  // against unmount (the call is async) and a missing map/fix, and clears the
  // overlay when the coordinate projects off the visible map.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const projectAvatar = useCallback(async () => {
    const map = mapRef.current;
    if (Platform.OS === 'web' || !map || !userLocation) return;
    try {
      const p = await map.pointForCoordinate({
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
      });
      if (!mountedRef.current || !p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
      // Hide the overlay once the user's coordinate is off the visible map. Allow a
      // half-footprint (52px) margin so it can still peek in at the edge.
      const size = mapSizeRef.current;
      const M = 52;
      const onScreen =
        !size || (p.x >= -M && p.y >= -M && p.x <= size.width + M && p.y <= size.height + M);
      setAvatarScreenPos(onScreen ? { x: p.x, y: p.y } : null);
    } catch {
      // pointForCoordinate can reject before the native map is laid out — ignore
      // and let the next region/layout/location change reproject.
    }
  }, [userLocation]);
  // Reproject whenever the user's coordinate changes (the map handlers below cover
  // pan/zoom and first layout).
  useEffect(() => {
    void projectAvatar();
  }, [projectAvatar]);

  // Centre the map on the user's base once we know it AND the map is mounted, so
  // a cold start that resolves home after first paint still seeds there. Skipped
  // once GPS has centred the camera (didCenterRef), so GPS always wins.
  useEffect(() => {
    if (!homeCoords || didCenterRef.current || Platform.OS === 'web') return;
    mapRef.current?.animateToRegion(
      { latitude: homeCoords.latitude, longitude: homeCoords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      0
    );
  }, [homeCoords]);

  const handleMarkerSelect = async (loc: ExploreLocation) => {
    translateY.setValue(0);
    setSelectedLoc(loc);
    setActiveSlide(0);
    // Reload check-ins
    const checkins = await storage.getCheckIns();
    setVisitedLogs(checkins);
  };

  // Open the "Suggest a location" sheet on a picked point. A Google POI tap
  // carries a name to prefill; an arbitrary long-press starts the name empty.
  const openSuggestSheet = (coordinate: Coordinates, name?: string) => {
    setSuggestCoord(coordinate);
    setSuggestName(name ?? '');
    setSuggestError(null);
    setSuggestSubmitted(false);
    setSuggestVisible(true);
  };

  const closeSuggestSheet = () => {
    setSuggestVisible(false);
    setSuggestError(null);
    setSuggestSubmitted(false);
  };

  // Submit the picked spot. Read a CURRENT GPS fix (the live watch if we have one,
  // else a one-shot read), enforce the 150m radius client-side, then POST. The
  // server re-checks within 150m and answers 422 with a message we surface inline.
  const handleSuggestSubmit = async ({ name, notes }: { name: string; notes: string }) => {
    if (!suggestCoord || suggestSubmitting) return;
    setSuggestSubmitting(true);
    setSuggestError(null);
    try {
      // Prefer the live watch fix; fall back to a fresh one-shot read.
      let coords = userLocation?.coords ?? null;
      if (!coords) {
        try {
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          coords = fix.coords;
        } catch {
          coords = null;
        }
      }
      if (!coords) {
        setSuggestError('We could not read your location. Turn on GPS and try again.');
        return;
      }

      const distance = haversineMeters(
        { latitude: coords.latitude, longitude: coords.longitude },
        suggestCoord,
      );
      if (distance > SUGGEST_RADIUS_M) {
        setSuggestError(
          `You are about ${formatDistance(distance)} away. Get within ${SUGGEST_RADIUS_M} m of the spot to suggest it.`,
        );
        return;
      }

      const result = await submitSuggestion({
        name: name || undefined,
        latitude: suggestCoord.latitude,
        longitude: suggestCoord.longitude,
        notes: notes || undefined,
        userLat: coords.latitude,
        userLng: coords.longitude,
      });
      if (result.ok) {
        setSuggestSubmitted(true);
      } else {
        setSuggestError(result.message ?? 'We could not submit that suggestion. Please try again.');
      }
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const getPinColor = (category: string) => {
    switch (category) {
      case 'parks':
        return Brand.sticker.green;
      case 'scenic':
        return Brand.teal;
      default:
        return Brand.sticker.purple;
    }
  };

  const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    switch (category) {
      case 'parks':
        return 'leaf';
      case 'scenic':
        return 'camera';
      default:
        return 'compass';
    }
  };

  const getCheckInStatus = (locationId: string) => {
    const entries = visitedLogs.filter((c) => c.locationId === locationId);
    if (entries.length === 0) return null;
    // Get latest check-in
    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
  };

  // All check-ins for the selected location, newest first — feeds the
  // "Previous Check-ins" sub-tab (read-only, reuses storage data).
  const getCheckInsForLocation = (locationId: string) => {
    return visitedLogs
      .filter((c) => c.locationId === locationId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  // Coordinates mathematical Haversine check for UI helpers
  const getDistanceToLocation = (locCoords: { latitude: number; longitude: number }) => {
    if (!userLocation) return null;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(locCoords.latitude - userLocation.coords.latitude);
    const dLon = toRad(locCoords.longitude - userLocation.coords.longitude);
    const lat1 = toRad(userLocation.coords.latitude);
    const lat2 = toRad(locCoords.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // distance in meters
    return Math.round(d);
  };

  // Arrival prompt: surface the nearest CHECKABLE spot (unlocked tier, not yet
  // checked in, off cooldown) once you walk within CHECK_IN_RADIUS. One-shot per
  // arrival (dismissedArrivalRef), re-armed only after you leave the zone. Hidden
  // reaches + an open detail card take precedence, so it never stacks.
  useEffect(() => {
    if (selectedLoc) {
      setArrivalSpot(null);
      return;
    }
    if (!userLocation) {
      setArrivalSpot(null);
      return;
    }
    const cand =
      reachable
        .map((l) => ({ l, d: getDistanceToLocation(l.coordinates) ?? Infinity }))
        .filter(
          ({ l, d }) =>
            d <= getConfig().checkInRadiusM &&
            l.tier <= unlockedTier(userLevel) &&
            !getCheckInStatus(l.id) &&
            !storage.nextCheckInAt(l.id)
        )
        .sort((a, b) => a.d - b.d)[0]?.l ?? null;
    if (!cand) {
      setArrivalSpot(null);
      dismissedArrivalRef.current = null; // left the zone → re-arm
      return;
    }
    if (dismissedArrivalRef.current === cand.id) return;
    setArrivalSpot((prev) => (prev?.id === cand.id ? prev : cand));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, reachable, visitedLogs, selectedLoc, userLevel]);

  // Hidden-spot-nearby readout comes from the SHARED provider (single source of
  // truth across home/map/camera). Within warm range → show the guide bar; within
  // reach (HIDDEN_RADIUS_M) → unlock it + open its card.
  const hiddenNearbyDist = nearestHidden?.warm ? hiddenDistanceM : null;
  const hiddenInReachId = hiddenInRange ? nearestHidden?.spot.id ?? null : null;

  // Baked "you are here" avatar PNGs (cold + hot) for the native Marker path. On
  // Android the avatar is a <Marker image={...} /> of this static bitmap — it
  // tracks the map in lock-step and can't go white or vanish (unlike a View-child
  // Marker). null while baking / on failure → we fall back to the RN overlay below.
  const avatarImages = useUserAvatarMarker(userAvatar);
  const avatarHot = hiddenNearbyDist != null;
  // Use the native baked marker only on Android (where the View-child snapshot
  // bugs live). iOS/web keep the projected RN overlay, which is reliable there.
  // Android ALWAYS renders the "you are here" avatar as a native Marker anchored
  // to the fix — lock-step with pan/zoom, can't go white or be dropped like a
  // View-child/remote-image marker, and no laggy projection. It shows the baked
  // avatar bitmap once ready, else a plain solid puck, so the indicator is NEVER
  // absent while we have a fix (the old two-path design left gaps during bake /
  // projection / remount where neither path rendered → the disappearing avatar).
  // The ONLY requirement is a GPS fix. iOS keeps the RN overlay below.
  const useAvatarMarker = Platform.OS === 'android' && !!userLocation;

  useEffect(() => {
    // Reaching a hidden spot on the map unlocks it (persists on the map) AND
    // opens its slide card right there — so the explorer can read about it and
    // check in without switching to the camera.
    if (hiddenInReachId && storage.unlockLocation(hiddenInReachId)) {
      void recordUnlock(hiddenInReachId); // persist the unlock server-side
      void refresh(); // provider re-reads unlocked → the spot folds out of "hidden"
      const found = reachable.find((l) => l.id === hiddenInReachId);
      if (found) handleMarkerSelect(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenInReachId]);

  // Brand-styled map pin: rounded badge with a dark stamp border. Checked-in
  // locations get a gold XP badge; not-yet-visited show the category icon.
  const renderPinBadge = (loc: ExploreLocation, isSelected: boolean) => {
    const checkedIn = !!getCheckInStatus(loc.id);
    // Hidden gem (Prized+, tier 4+): a distinct PURPLE diamond pin so a rare find
    // never reads as an ordinary spot.
    const gem = (loc.tier ?? 0) >= 4;
    return (
      <View style={styles.pinWrapper}>
        <View
          style={[
            styles.pinBubble,
            stampBorder,
            {
              backgroundColor: checkedIn ? Brand.ink : gem ? Brand.purple : getPinColor(loc.category),
              transform: [{ scale: isSelected ? 1.18 : 1 }],
            },
          ]}
        >
          {checkedIn ? (
            <Ionicons name="checkmark" size={16} color={Brand.bg} />
          ) : gem ? (
            <Ionicons name="diamond" size={14} color={Brand.bg} />
          ) : (
            <Ionicons name={getCategoryIcon(loc.category)} size={15} color={Brand.ink} />
          )}
        </View>
        {/* Gold XP badge floating on the pin */}
        <View style={[styles.xpBadge, stampBorder, styles.xpBadgeBorder]}>
          <Ionicons name="trophy" size={9} color="#b46c00" />
          <BrandText weight="bold" style={styles.xpBadgeText}>
            +{loc.points}
          </BrandText>
        </View>
        <View style={[styles.pinArrow, { borderTopColor: Brand.ink }]} />
      </View>
    );
  };

  const selectedCheckIns = selectedLoc ? getCheckInsForLocation(selectedLoc.id) : [];
  const selectedLatest = selectedLoc ? getCheckInStatus(selectedLoc.id) : null;
  // A hidden gem (Prized+, tier 4+) — drives the rarity badge on the detail card.
  const selectedIsGem = (selectedLoc?.tier ?? 0) >= 4;
  // 24h re-check-in cooldown (spec 06): null when checkable, else the Date it's
  // available again. Drives the disabled CHECK IN state on the detail sheet.
  const cooldownUntil = selectedLoc ? storage.nextCheckInAt(selectedLoc.id) : null;
  const cooldownHoursLeft = cooldownUntil
    ? Math.max(1, Math.ceil((cooldownUntil.getTime() - Date.now()) / (60 * 60 * 1000)))
    : 0;

  // Geofence gate (#8): if we know where the user is and they're outside the
  // selected spot's geofence, disable CHECK IN so they can't tap straight into
  // the camera and "instant check-in" from far away. The camera step verifies
  // again from live GPS. When userLocation is unknown we leave it enabled.
  // Effective radius mirrors camera.tsx: the location's own geofence (default
  // 150m) floored at 50m so the tolerance is never unreasonably tight.
  const selectedDistance = selectedLoc ? getDistanceToLocation(selectedLoc.coordinates) : null;
  // Hard 20m check-in radius for ALL spots (shared with the camera gate).
  const selectedRadius = getConfig().checkInRadiusM;
  const tooFar = selectedDistance != null && selectedDistance > selectedRadius;
  // Hard tier-lock: a surfaced spot above your tier requires leveling up — no
  // check-in even if you're standing on it (the camera enforces this too). EXCEPT
  // a hidden spot the user has physically UNLOCKED, which becomes checkable.
  const selectedLocked =
    !!selectedLoc &&
    selectedLoc.tier > unlockedTier(userLevel) &&
    !unlockedIds.has(selectedLoc.id);
  const checkInDisabled = !!cooldownUntil || tooFar || selectedLocked;

  // Local-first vicinity gate (layered on top of the tier filter already applied
  // to `locations` in init): a spot shows if it's a major destination, OR we have
  // neither a GPS fix nor a known base, OR it's within VICINITY_RADIUS_M. We fall
  // back to the user's home base before GPS so the map stays local from the first
  // paint instead of showing the whole world, then GPS refines it.
  const userCoords = userLocation
    ? { latitude: userLocation.coords.latitude, longitude: userLocation.coords.longitude }
    : homeCoords;
  const visibleLocations = reachable.filter((loc) => {
    // Client-side category filter (default = all on, so this is a no-op until the
    // user narrows it). Only KNOWN categories are gated; an unrecognised category
    // (none today, but future-proof) is never hidden by a chip it has no toggle for.
    const isKnownCategory = CATEGORY_FILTERS.some((c) => c.key === loc.category);
    if (isKnownCategory && !activeCategories.has(loc.category)) return false;
    // A spot the user has physically UNLOCKED or VISITED (checked into), a major
    // destination, or the explicitly-selected spot are always on the map — they
    // bypass the tier + vicinity gates so a just-checked-in spot can never vanish
    // due to momentarily-stale in-memory state (belt-and-suspenders guard).
    if (
      unlockedIds.has(loc.id) ||
      visitedIds.has(loc.id) ||
      loc.id === searchParams.selectedId ||
      loc.isMajorDestination
    ) return true;
    // The map draws only your UNLOCKED pins (+ always-visible majors + a spot you
    // explicitly opened, e.g. a "Worth the trip" teaser tapped on Home). The
    // +1/+2 locked teasers and the +3 hidden band are never normal pins.
    const tierVisible =
      loc.tier <= unlockedTier(userLevel) ||
      loc.isMajorDestination ||
      loc.id === searchParams.selectedId;
    const reachVisible =
      loc.id === searchParams.selectedId ||
      loc.isMajorDestination ||
      !userCoords ||
      isWithinVicinity(userCoords, loc.coordinates, getConfig().vicinityRadiusM * tierRadiusBoost(userLevel));
    return tierVisible && reachVisible;
  });

  // Is the open spot a trip beyond the local bubble? Drives a "Worth the trip"
  // note on the detail sheet so the explorer knows it's outside their area.
  const selectedIsReach =
    !!selectedLoc &&
    !selectedLoc.isMajorDestination &&
    selectedDistance != null &&
    selectedDistance > getConfig().vicinityRadiusM * tierRadiusBoost(userLevel);

  return (
    <View style={styles.container}>
      {/* No top sweep bar on the map — the single open-app loader card below
          covers both "finding you" and "loading nearby spots" in one place. */}

      {/* Top overlay: while a hidden spot is nearby, the guide bar takes over so
          the user can hunt it from the (lower-battery) map; otherwise the gold
          announcement shows — and comes back here once they leave the area,
          unless they'd already dismissed it. */}
      {hiddenNearbyDist != null ? (
        <HiddenNearbyBar
          distance={hiddenNearbyDist}
          style={[styles.topOverlay, Platform.OS !== 'web' && { top: insets.top + 8 }]}
        />
      ) : announcement && !announcementDismissed ? (
        <View
          style={[
            styles.announcement,
            stampBorder,
            Platform.OS !== 'web' && { top: insets.top + 8 },
          ]}
        >
          <BrandText weight="semibold" style={styles.announcementText} numberOfLines={2}>
            {announcement.title ? `${announcement.title}: ${announcement.body}` : announcement.body}
          </BrandText>
          <TouchableOpacity
            onPress={() => setAnnouncementDismissed(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={Brand.ink} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* TEMP avatar diagnostic — read this when the puck/avatar is missing so we
          know WHICH condition failed (loc = GPS fix, img = baked bitmap, mk = which
          marker is being rendered). Remove once the vanish is pinned. */}
      {Platform.OS !== 'web' && (
        <View style={[styles.avatarDebug, { top: insets.top + 56 }]} pointerEvents="none">
          <BrandText style={styles.avatarDebugText}>
            {`av  loc=${userLocation ? '✓' : '✗'}  img=${avatarImages ? '✓' : '✗'}  mk=${useAvatarMarker ? (avatarImages ? 'baked' : 'puck') : 'none'}`}
          </BrandText>
        </View>
      )}

      {/* Map View Section */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' || !MapView ? (
          // Web styled paper-map mockup (web has no native map; satellite just
          // tints the mockup darker so the toggle is demonstrable here)
          <View style={[styles.webMapBackground, satellite && styles.webMapSatellite]}>
            <View style={styles.webLake} />
            <View style={styles.webPark} />

            {/* Custom Interactive Pins */}
            {visibleLocations.map((loc) => {
              const isSelected = selectedLoc?.id === loc.id;
              // Map lat/long to absolute pixel values roughly centered around Perth coordinates
              const leftVal = 100 + (loc.coordinates.longitude - 115.8291) * 3000;
              const topVal = 200 - (loc.coordinates.latitude - -31.9472) * 3000;

              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.webMarker, { left: leftVal, top: topVal }]}
                  onPress={() => handleMarkerSelect(loc)}
                >
                  {renderPinBadge(loc, isSelected)}
                </TouchableOpacity>
              );
            })}

            <View style={styles.webMapHint}>
              <BrandText weight="medium" style={styles.webMapHintText}>
                Interactive map preview
              </BrandText>
            </View>
          </View>
        ) : (
          // Native react-native-maps rendering
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              // Open at the user's base if we have it cached at mount; else a
              // sensible default (GPS / the init seed refine it immediately).
              latitude: initialHome?.latitude ?? -31.953,
              longitude: initialHome?.longitude ?? 115.845,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            mapType={satellite ? 'hybrid' : 'standard'}
            customMapStyle={satellite ? SATELLITE_MAP_STYLE : LIGHT_MAP_STYLE}
            // The map is laid out — flush any center target the locate flow computed
            // before the map was ready (else that zoom would be silently dropped).
            onMapReady={() => {
              mapReady.current = true;
              const t = pendingCenterRef.current;
              if (t && mapRef.current) {
                mapRef.current.animateToRegion(
                  { latitude: t.latitude, longitude: t.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
                  600
                );
                pendingCenterRef.current = null;
              }
              // Place the avatar overlay as soon as the map can project a point.
              void projectAvatar();
            }}
            // Capture the map's pixel size so projectAvatar can hide the avatar
            // overlay when the user projects off-screen, and project once on layout.
            onLayout={(e: { nativeEvent: { layout: { width: number; height: number } } }) => {
              mapSizeRef.current = {
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              };
              void projectAvatar();
            }}
            // Native Google controls clash with the status bar / pill nav — use
            // our own avatar marker + recenter button instead.
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
            // Tapping a Google POI suggests THAT place (its name prefills the
            // sheet); long-pressing anywhere suggests an arbitrary spot. Both are
            // for places not yet on Locatour — markers/check-in keep their own taps.
            onPoiClick={(e: { nativeEvent: { name?: string; coordinate: Coordinates } }) => {
              const { coordinate, name } = e.nativeEvent;
              openSuggestSheet(coordinate, name);
            }}
            onLongPress={(e: { nativeEvent: { coordinate: Coordinates } }) => {
              openSuggestSheet(e.nativeEvent.coordinate);
            }}
            // Reproject the avatar overlay live during a pan/zoom — onRegionChange
            // fires continuously through the gesture — so it tracks the user's
            // coordinate smoothly instead of jumping only on settle.
            onRegionChange={() => {
              void projectAvatar();
            }}
            // Track the camera heading so our compass needle points to true north
            // and we know whether the map is already north-up. Also reproject the
            // avatar overlay once the region settles.
            onRegionChangeComplete={async () => {
              try {
                const cam = await mapRef.current?.getCamera();
                if (cam && typeof cam.heading === 'number') setMapHeading(cam.heading);
              } catch {}
              void projectAvatar();
            }}
          >
            {/* Soft "your reach" bubble: the VICINITY_RADIUS_M radius around the
                user, in low-opacity brand teal, drawn once we have a fix. */}
            {userCoords && Circle && (
              <Circle
                center={userCoords}
                radius={getConfig().vicinityRadiusM * tierRadiusBoost(userLevel)}
                strokeWidth={1}
                strokeColor="rgba(125,227,231,0.65)"
                fillColor="rgba(125,227,231,0.14)"
              />
            )}

            {visibleLocations.map((loc) => (
              <Marker
                key={loc.id}
                coordinate={loc.coordinates}
                onPress={() => handleMarkerSelect(loc)}
              >
                {renderPinBadge(loc, selectedLoc?.id === loc.id)}
              </Marker>
            ))}

            {/* "You are here" — native Marker of a STATIC baked PNG (Android). A
                single bitmap handed to the native Google Maps marker tracks pan/zoom
                in lock-step and never goes white / is dropped on tab focus, unlike a
                View-child Marker. The cold/hot variants swap the rainbow halo. The
                key is the baked image URI itself, so the native marker REMOUNTS
                whenever the bitmap changes — the hot/cold halo toggle AND a profile
                avatar change (which bakes a new per-avatar file). A stable key with
                tracksViewChanges={false} would keep the stale/blank bitmap. */}
            {useAvatarMarker && Marker && (
              avatarImages ? (
                <Marker
                  key={avatarHot ? avatarImages.hot : avatarImages.cold}
                  coordinate={{
                    latitude: userLocation!.coords.latitude,
                    longitude: userLocation!.coords.longitude,
                  }}
                  image={{ uri: avatarHot ? avatarImages.hot : avatarImages.cold }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={999}
                />
              ) : (
                // Avatar bitmap not baked yet (first load / re-bake) — show a plain
                // solid puck so the indicator is NEVER absent. Solid-colour Views
                // snapshot reliably; only async remote-image children flash white.
                <Marker
                  key="avatar-fallback-puck"
                  coordinate={{
                    latitude: userLocation!.coords.latitude,
                    longitude: userLocation!.coords.longitude,
                  }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges
                  zIndex={999}
                >
                  <View style={[styles.fallbackPuck, avatarHot && styles.fallbackPuckHot]}>
                    <View style={styles.fallbackPuckDot} />
                  </View>
                </Marker>
              )
            )}

            {/* Pending suggestion pin: while the "suggest a location" flow is open,
                drop a temporary dashed ghost marker at the exact picked coordinate so
                the explorer can confirm the spot. Deliberately distinct from real
                location pins (dashed purple bubble, no XP badge) and removed the
                moment the flow is cancelled or submitted (suggestVisible → false). */}
            {suggestVisible && suggestCoord && Marker && (
              <Marker
                coordinate={suggestCoord}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={true}
              >
                <View style={styles.suggestPinWrap}>
                  <View style={styles.suggestPinBubble}>
                    <Ionicons name="add" size={20} color={Brand.bg} />
                  </View>
                  <View style={styles.suggestPinArrow} />
                </View>
              </Marker>
            )}

            {/* NOTE: the "you are here" avatar is intentionally NOT a Marker here —
                it's a plain RN overlay <View> rendered AFTER this MapView (below),
                positioned via projectAvatar. See the avatarScreenPos overlay block. */}
          </MapView>
        )}

        {/* "You are here" — the user's avatar in a teal ring, rendered as a plain RN
            overlay ON TOP of the MapView (a sibling drawn after it), positioned by
            projecting the user's coordinate to a screen pixel (avatarScreenPos). A
            pink rainbow glow appears around it while a hidden spot is nearby. Because
            this is a normal View (never a snapshotted marker bitmap), it can't go
            white on cold load or vanish after a tab switch; it reprojects on every
            region change so it tracks pan/zoom, and hides when off the visible map.
            pointerEvents="none" so map gestures pass straight through it. */}
        {Platform.OS !== 'web' && MapView && !useAvatarMarker && userLocation && userAvatar && avatarScreenPos && (
          <View
            pointerEvents="none"
            style={[
              styles.userMarkerWrap,
              {
                position: 'absolute',
                left: avatarScreenPos.x - 52,
                top: avatarScreenPos.y - 52,
              },
            ]}
          >
            {/* Static rainbow halo (matches the camera shutter glow), shown only
                while a hidden spot is near. A plain <Image> of a pre-baked PNG. */}
            {hiddenNearbyDist != null && <RainbowGlowMarker />}
            <View style={[styles.userMarkerRing, hiddenNearbyDist != null && styles.userMarkerRingHot]}>
              {avatarFailed ? (
                <Ionicons name="person" size={20} color={Brand.purple} />
              ) : (
                <Image
                  source={{ uri: userAvatar }}
                  style={styles.userMarkerAvatar}
                  onError={() => setAvatarFailed(true)}
                />
              )}
            </View>
          </View>
        )}

        {/* Single open-app loader: one card with a two-step checklist (finding you
            → loading nearby spots), each ticking green as it finishes, then the
            whole card auto-dismisses. Replaces the old top bar + "Locating you…"
            pill flashing separately. */}
        {Platform.OS !== 'web' && !initialLoadComplete && (
          <View style={styles.locatingOverlay} pointerEvents="none">
            <View style={[styles.loadCard, stampBorder]}>
              <View style={styles.loadRow}>
                {gpsReady ? (
                  <Ionicons name="checkmark-circle" size={22} color={Brand.sticker.green} />
                ) : (
                  <ActivityIndicator size="small" color={Brand.ink} />
                )}
                <BrandText weight="semibold" color={Brand.ink} style={styles.loadRowText}>
                  Finding you
                </BrandText>
              </View>
              <View style={styles.loadRow}>
                {spotsReady ? (
                  <Ionicons name="checkmark-circle" size={22} color={Brand.sticker.green} />
                ) : (
                  <ActivityIndicator size="small" color={Brand.ink} />
                )}
                <BrandText weight="semibold" color={Brand.ink} style={styles.loadRowText}>
                  Loading nearby spots
                </BrandText>
              </View>
            </View>
          </View>
        )}

        {/* Satellite + reset-north compass + recenter buttons (native only). Three
            equal-size icon buttons stacked above the floating pill tab bar, clear
            of the bottom inset (Google-Maps style). */}
        {Platform.OS !== 'web' && MapView && (
          <>
            {/* Satellite / standard toggle — icon only, top of the stack. */}
            <TouchableOpacity
              style={[styles.recenterBtn, stampBorder, { bottom: insets.bottom + 192 }]}
              onPress={() => setSatellite((s) => !s)}
              activeOpacity={0.85}
            >
              <Ionicons name={satellite ? 'map' : 'globe-outline'} size={20} color={Brand.ink} />
            </TouchableOpacity>
            {/* Reset-to-north compass. Red half = north; the rose counter-rotates
                with the map so it always points at true north. Tap = rotate to N. */}
            <TouchableOpacity
              style={[styles.recenterBtn, stampBorder, { bottom: insets.bottom + 140 }]}
              onPress={() =>
                // Re-orient the camera to true north (and flatten any pitch).
                mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 300 })
              }
              activeOpacity={0.85}
            >
              <View style={[styles.compassRose, { transform: [{ rotate: `${-mapHeading}deg` }] }]}>
                <View style={styles.compassNeedleN} />
                <View style={styles.compassNeedleS} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.recenterBtn, stampBorder, { bottom: insets.bottom + 88 }]}
              onPress={() => {
                if (userLocation) {
                  mapRef.current?.animateToRegion(
                    {
                      latitude: userLocation.coords.latitude,
                      longitude: userLocation.coords.longitude,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    },
                    500
                  );
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="locate" size={20} color={Brand.ink} />
            </TouchableOpacity>

            {/* Category filter — bottom-LEFT, inline with the recenter FAB so the
                two read as a matched pair. A purple dot shows when a filter is on. */}
            <TouchableOpacity
              style={[styles.filterBtn, stampBorder, { bottom: insets.bottom + 88 }]}
              onPress={() => setFilterOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Filter map by category"
            >
              <Ionicons name="options-outline" size={20} color={Brand.ink} />
              {filterActive && <View style={styles.filterActiveDot} />}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Arrival prompt — you've walked up to a checkable spot. */}
      {arrivalSpot && (
        <View style={[styles.arrivalBanner, stampBorder, { bottom: insets.bottom + 84 }]}>
          <Ionicons name="walk" size={20} color={Brand.bg} />
          <BrandText weight="bold" color={Brand.bg} style={styles.arrivalText} numberOfLines={1}>
            You&apos;re at {arrivalSpot.name} — check in?
          </BrandText>
          <TouchableOpacity
            onPress={() => {
              const id = arrivalSpot.id;
              const pts = arrivalSpot.points;
              dismissedArrivalRef.current = id;
              setArrivalSpot(null);
              router.push({ pathname: '/camera', params: { locationId: id, points: pts } });
            }}
          >
            <BrandText weight="bold" color={Brand.bg} style={styles.arrivalCta}>
              CHECK IN
            </BrandText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              dismissedArrivalRef.current = arrivalSpot.id;
              setArrivalSpot(null);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={Brand.bg} />
          </TouchableOpacity>
        </View>
      )}

      {/* Location detail slide-over — a full-screen Modal so it covers the tab bar
          ("over the nav and everything"). Opens for ANY tapped location; drag the
          card down (or tap the dimmed backdrop) to dismiss. */}
      <Modal
        visible={!!selectedLoc}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeSheet}
      >
        {selectedLoc && (
          <GestureHandlerRootView style={styles.sheetModalRoot}>
            {/* Dim is a PURE visual layer (pointerEvents none) so its opacity is
                driven only by our fade animation — never by a TouchableOpacity's
                internal press-opacity, which fought the fade and flashed. A
                separate full-screen Pressable handles tap-to-close. */}
            <Animated.View
              style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}
              pointerEvents="none"
            />
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
            <GestureDetector gesture={sheetDrag}>
            <Animated.View
              style={[styles.bottomSheet, stampBorder, { transform: [{ translateY }] }]}
            >
            {/* Grabber + title — drag the whole card down to dismiss (no close cross) */}
            <View style={styles.sheetGrabber}>
              <View style={styles.dragHandle} />
              <View style={styles.sheetTitleRow}>
                <BrandText weight="semibold" style={styles.sheetTitle} numberOfLines={1}>
                  {selectedLoc.name}
                </BrandText>
                {selectedLatest && <Ionicons name="checkmark-circle" size={20} color={Brand.purple} />}
              </View>
              {selectedIsGem && (
                <View style={styles.gemBadge}>
                  <Ionicons name="diamond" size={13} color={Brand.bg} />
                  <BrandText weight="bold" style={styles.gemBadgeText}>
                    {rarityForTier(selectedLoc.tier)} · Hidden gem
                  </BrandText>
                </View>
              )}
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                // Only let a downward drag dismiss the sheet when content is
                // scrolled to the top; otherwise the ScrollView keeps the gesture.
                setSheetScrollAtTop(e.nativeEvent.contentOffset.y <= 0);
              }}
            >
              {/* Photo Carousel */}
              <View style={styles.carouselWrapper}>
                <FlatList
                  ref={flatListRef}
                  data={selectedLoc.imageUrls}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_item, index) => index.toString()}
                  onScroll={(e) => {
                    const slide = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_WIDTH);
                    setActiveSlide(slide);
                  }}
                  renderItem={({ item }) => <Image source={{ uri: item }} style={styles.carouselImage} />}
                />
                {selectedLoc.imageUrls.length > 1 && (
                  <View style={styles.paginationRow}>
                    {selectedLoc.imageUrls.map((_, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.paginationDot,
                          { backgroundColor: idx === activeSlide ? Brand.purple : Brand.inkSubtle },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>

              {/* XP & Distance stats */}
              <View style={styles.statsRow}>
                <View style={[styles.statPill, styles.xpStatPill]}>
                  <Ionicons name="trophy" size={14} color="#b46c00" />
                  <BrandText weight="bold" style={styles.xpStatText}>
                    {selectedLoc.points} Points
                  </BrandText>
                </View>
                {userLocation && (
                  <View style={[styles.statPill, styles.distStatPill]}>
                    <Ionicons name="location" size={14} color={Brand.ink} />
                    <BrandText weight="semibold" style={styles.distStatText}>
                      {formatDistance(getDistanceToLocation(selectedLoc.coordinates))} away
                    </BrandText>
                  </View>
                )}
                {selectedIsReach && (
                  <View style={[styles.statPill, styles.reachStatPill]}>
                    <Ionicons name="airplane" size={13} color={Brand.purple} />
                    <BrandText weight="bold" style={styles.reachStatText}>
                      Worth the trip — outside your area
                    </BrandText>
                  </View>
                )}
              </View>

              {/* Universal get-directions — Apple Maps on iOS, Google/geo on Android.
                  Hidden once the user is AT the spot (within check-in range) — no
                  point routing them where they're standing. Still shown when the
                  distance is unknown (no GPS fix yet). */}
              {!(selectedDistance != null && !tooFar) && (
                <TouchableOpacity
                  style={[styles.directionsBtn, stampBorder]}
                  onPress={() =>
                    openDirections(
                      selectedLoc.coordinates.latitude,
                      selectedLoc.coordinates.longitude,
                      selectedLoc.name
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Ionicons name="navigate" size={16} color={Brand.ink} />
                  <BrandText weight="bold" color={Brand.ink} style={styles.directionsBtnText}>
                    Get directions
                  </BrandText>
                </TouchableOpacity>
              )}

              {/* Address */}
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={16} color={Brand.purple} />
                <BrandText weight="medium" color={Brand.inkSecondary} style={styles.addressText}>
                  {selectedLoc.address}
                </BrandText>
              </View>

              {/* Description */}
              <BrandText weight="medium" color={Brand.inkSecondary} style={styles.descriptionText}>
                {selectedLoc.description}
              </BrandText>

              {/* Previous check-ins — only once some exist, at the bottom of the card */}
              {selectedCheckIns.length > 0 && (
                <View style={styles.historySection}>
                  <BrandText weight="semibold" style={styles.historyHeading}>
                    Previous check-ins
                  </BrandText>
                  {selectedCheckIns.map((entry) => (
                    <View key={entry.id} style={[styles.historyCard, stampBorder, styles.historyCardBorder]}>
                      <Image
                        source={{ uri: entry.photoUrl || selectedLoc.imageUrls[0] }}
                        style={styles.historyThumb}
                      />
                      <View style={styles.historyInfo}>
                        <View style={styles.historyMetaRow}>
                          <Ionicons name="calendar-outline" size={15} color={Brand.ink} />
                          <BrandText weight="medium" style={styles.historyDate}>
                            {formatDate(entry.timestamp)}
                          </BrandText>
                        </View>
                        <View style={styles.historyMetaRow}>
                          <Ionicons name="time-outline" size={15} color={Brand.inkSecondary} />
                          <BrandText weight="medium" color={Brand.inkSecondary} style={styles.historyTime}>
                            {formatTime(entry.timestamp)}
                          </BrandText>
                        </View>
                        <View style={styles.historyMetaRow}>
                          <Ionicons name="trophy-outline" size={15} color="#e59824" />
                          <BrandText weight="medium" style={styles.historyPoints}>
                            {entry.pointsEarned} Points
                          </BrandText>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* CHECK IN Action CTA — purple stamp button. Disabled within the
                24h re-check-in cooldown window (spec 06). Bottom padding clears
                the floating pill nav. */}
            <View style={[styles.ctaWrapper, { paddingBottom: insets.bottom + Spacing.four }]}>
              {/* Ready-again nudge for a spot you've checked in before. */}
              {!checkInDisabled && selectedLatest && (
                <View style={styles.recheckPrompt}>
                  <Ionicons name="refresh-circle" size={16} color={Brand.purple} />
                  <BrandText weight="bold" color={Brand.purple} style={styles.recheckText}>
                    Ready again — check in to earn points here once more!
                  </BrandText>
                </View>
              )}
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={checkInDisabled}
                style={[styles.checkInBtn, stampBorder, checkInDisabled && styles.checkInBtnDisabled]}
                onPress={() =>
                  router.push({
                    pathname: '/camera',
                    params: { locationId: selectedLoc.id, points: selectedLoc.points },
                  })
                }
              >
                <Ionicons
                  name={
                    selectedLocked
                      ? 'lock-closed'
                      : cooldownUntil
                        ? 'time-outline'
                        : tooFar
                          ? 'walk-outline'
                          : 'camera'
                  }
                  size={18}
                  color={Brand.bg}
                />
                <BrandText weight="bold" color={Brand.bg} style={styles.checkInBtnText}>
                  {selectedLocked
                    ? `REACH LEVEL ${levelForTier(selectedLoc.tier)} TO UNLOCK`
                    : cooldownUntil
                      ? `AVAILABLE IN ${cooldownHoursLeft}H`
                      : tooFar
                        ? `GET CLOSER • ${formatDistance(selectedDistance)} AWAY`
                        : 'CHECK IN'}
                </BrandText>
              </TouchableOpacity>
              {/* Reassuring cooldown explainer so the disabled state doesn't read
                  as "broken" — it's a deliberate daily cadence. */}
              {cooldownUntil && (
                <View style={styles.cooldownHint}>
                  <Ionicons name="information-circle-outline" size={14} color={Brand.inkSecondary} />
                  <BrandText weight="medium" color={Brand.inkSecondary} style={styles.cooldownHintText}>
                    Locations cool down — come back tomorrow to earn points here again (once every {getConfig().checkinCooldownH}h).
                  </BrandText>
                </View>
              )}
            </View>
            </Animated.View>
            </GestureDetector>
          </GestureHandlerRootView>
        )}
      </Modal>

      {/* Category filter sheet — a compact bottom sheet of selectable chips that
          REUSE the map's pin colour + icon, so a chip looks like the pin it
          toggles. Selecting/deselecting filters markers client-side; default is
          all-on (unchanged map). Tap the dim backdrop or Done to close. */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable style={styles.filterBackdrop} onPress={() => setFilterOpen(false)}>
          {/* Stop taps on the card from closing the sheet. */}
          <Pressable
            style={[styles.filterSheet, stampBorder, { paddingBottom: insets.bottom + Spacing.three }]}
            onPress={() => {}}
          >
            <View style={styles.filterGrabber} />
            <BrandText weight="semibold" style={styles.filterHeading}>
              Show on map
            </BrandText>
            <View style={styles.filterChipRow}>
              {CATEGORY_FILTERS.map(({ key, label }) => {
                const selected = activeCategories.has(key);
                const tint = getPinColor(key);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.filterChip,
                      stampBorder,
                      {
                        backgroundColor: selected ? tint : Brand.surface,
                        opacity: selected ? 1 : 0.55,
                      },
                    ]}
                    onPress={() => toggleCategory(key)}
                    activeOpacity={0.85}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${label} locations`}
                  >
                    <Ionicons
                      name={getCategoryIcon(key)}
                      size={16}
                      color={selected ? Brand.ink : Brand.inkSecondary}
                    />
                    <BrandText weight="bold" style={styles.filterChipText}>
                      {label}
                    </BrandText>
                    {selected && <Ionicons name="checkmark" size={15} color={Brand.ink} />}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.filterDoneBtn, stampBorder]}
              onPress={() => setFilterOpen(false)}
              activeOpacity={0.85}
            >
              <BrandText weight="bold" color={Brand.bg} style={styles.filterDoneText}>
                DONE
              </BrandText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Community "Suggest a location" sheet — opened by a POI tap / long-press. */}
      <SuggestLocationSheet
        visible={suggestVisible}
        coordinate={suggestCoord}
        prefilledName={suggestName}
        submitting={suggestSubmitting}
        submitted={suggestSubmitted}
        errorMessage={suggestError}
        onSubmit={handleSuggestSubmit}
        onClose={closeSuggestSheet}
      />
    </View>
  );
}

// Full-width sheet: carousel spans the window minus the scroll content's padding.
const CAROUSEL_WIDTH = Dimensions.get('window').width - Spacing.three * 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bg,
    position: 'relative',
  },

  // Announcement banner (native `top` is applied inline from safe-area insets)
  // Positioning for the hidden-nearby guide bar (overlays where the announcement
  // sits; the bar carries its own pink/rounded visuals).
  topOverlay: {
    position: 'absolute',
    top: Platform.OS === 'web' ? Spacing.three : 52,
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 20,
  },
  announcement: {
    position: 'absolute',
    top: Platform.OS === 'web' ? Spacing.three : 52,
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Brand.sticker.gold,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  announcementText: {
    flex: 1,
    fontSize: 13,
    color: Brand.ink,
  },

  // Map
  mapContainer: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  // "Locating you…" overlay shown until the first GPS fix. Above the map/controls
  // (zIndex 20) but below the detail sheet (zIndex 30).
  locatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
  },
  // Open-app loader card holding the finding-you / loading-spots checklist.
  loadCard: {
    gap: Spacing.three,
    backgroundColor: Brand.surface,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
    borderRadius: BrandRadius.sticker,
  },
  loadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  loadRowText: {
    fontSize: 15,
  },
  // "You're at X — check in?" arrival banner, floating above the tab bar.
  arrivalBanner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.teal,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: BrandRadius.pill,
    zIndex: 25,
  },
  arrivalText: {
    flex: 1,
    fontSize: 14,
  },
  arrivalCta: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  // Satellite toggle (native `top` is applied inline from safe-area insets)
  // Compass rose inside the reset-north button: a diamond needle, red half = N.
  compassRose: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassNeedleN: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ef4444', // north — red
  },
  compassNeedleS: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Brand.ink, // south — dark
  },
  // Recenter / my-location button (native only; `bottom` applied inline).
  recenterBtn: {
    position: 'absolute',
    right: Spacing.three,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    zIndex: 20,
  },
  // Category filter FAB — mirrors recenterBtn but anchored LEFT, inline with the
  // recenter button (same `bottom` inset) so the two form a matched pair.
  filterBtn: {
    position: 'absolute',
    left: Spacing.three,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    zIndex: 20,
  },
  // Small accent dot on the filter FAB while a filter is active.
  filterActiveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.purple,
    borderWidth: 1.5,
    borderColor: Brand.surface,
  },
  // Filter chip sheet (compact bottom sheet over a dim, tap-to-close backdrop).
  filterBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  filterSheet: {
    backgroundColor: Brand.bg,
    borderTopLeftRadius: BrandRadius.sticker,
    borderTopRightRadius: BrandRadius.sticker,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  filterGrabber: {
    width: 44,
    height: 4,
    borderRadius: BrandRadius.pill,
    backgroundColor: 'rgba(42,36,33,0.22)',
    alignSelf: 'center',
    marginBottom: Spacing.one,
  },
  filterHeading: {
    fontSize: 15,
    color: Brand.ink,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: BrandRadius.pill,
  },
  filterChipText: {
    fontSize: 13,
    color: Brand.ink,
    letterSpacing: 0.2,
  },
  filterDoneBtn: {
    backgroundColor: Brand.purple,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: BrandRadius.control,
  },
  filterDoneText: {
    fontSize: 13,
    letterSpacing: 0.65,
  },
  // Live "you are here" avatar marker.
  userMarkerRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    borderWidth: 2,
    borderColor: Brand.teal,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 4,
  },
  userMarkerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Brand.surface,
  },
  // Wrapper gives the pink "hidden nearby" glow room around the avatar ring.
  // Sized to fit the rainbow halo Image (104x104) so the marker bitmap isn't clipped.
  userMarkerWrap: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerRingHot: {
    // White ring around the rainbow halo — echoes the camera shutter button.
    borderColor: '#fff',
  },
  webMapBackground: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Brand.bg,
  },
  webMapSatellite: {
    backgroundColor: '#2f3a2c',
  },
  webLake: {
    position: 'absolute',
    width: 250,
    height: 150,
    borderRadius: 75,
    top: '35%',
    left: '40%',
    backgroundColor: '#bfe6e9',
  },
  webPark: {
    position: 'absolute',
    width: 300,
    height: 250,
    top: '10%',
    left: '10%',
    borderRadius: 30,
    backgroundColor: '#dcefdf',
  },
  webMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  webMapHint: {
    position: 'absolute',
    bottom: Spacing.six + 10,
    alignSelf: 'center',
    backgroundColor: Brand.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    ...stampBorder,
    borderRadius: BrandRadius.pill,
  },
  webMapHintText: {
    fontSize: 12,
    color: Brand.inkSecondary,
  },

  // Map pin
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    // Symmetric horizontal room so the XP badge (which floats off the bubble's
    // top-right) stays inside the marker's bounds — native maps clip overflow.
    paddingHorizontal: 26,
  },
  pinBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpBadge: {
    position: 'absolute',
    top: 0,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ffdf34',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  xpBadgeBorder: {
    borderColor: '#ffae34',
    borderRadius: BrandRadius.pill,
  },
  xpBadgeText: {
    fontSize: 9,
    color: '#b46c00',
  },
  pinArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },

  // Pending "suggest a location" pin — a dashed purple ghost bubble, intentionally
  // distinct from the solid category pins so the spot the user is suggesting reads
  // as tentative/unconfirmed. Temporary: only mounted while the suggest sheet is open.
  suggestPinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestPinBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.purple,
    borderWidth: 2,
    borderColor: Brand.ink,
    borderStyle: 'dashed',
  },
  suggestPinArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Brand.ink,
    marginTop: -1,
  },

  // Sheet
  // The slide-over lives in a full-screen Modal now (covers the tab bar). Root
  // fills the window; the card sits at the bottom over a dim, tap-to-close backdrop.
  sheetModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomSheet: {
    marginHorizontal: 0,
    marginBottom: 0,
    backgroundColor: Brand.bg,
    borderTopLeftRadius: BrandRadius.sticker,
    borderTopRightRadius: BrandRadius.sticker,
    overflow: 'hidden',
    maxHeight: '85%',
    // Android stacks by elevation; the buttons have none, so this floats the card
    // above them (and gives it a natural lift shadow).
    elevation: 12,
  },
  // Draggable grabber zone (handle + title) at the top of the sheet.
  sheetGrabber: {
    alignItems: 'center',
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,36,33,0.1)',
  },
  dragHandle: {
    width: 44,
    height: 4,
    borderRadius: BrandRadius.pill,
    backgroundColor: 'rgba(42,36,33,0.22)',
    marginBottom: Spacing.two,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  // Rarity "Hidden gem" pill under the title on the detail card — purple stamp so
  // a rare find reads as special.
  gemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    marginTop: Spacing.two,
    paddingVertical: 4,
    paddingHorizontal: Spacing.three,
    backgroundColor: Brand.purple,
    borderRadius: BrandRadius.pill,
  },
  gemBadgeText: {
    fontSize: 12,
    letterSpacing: 0.4,
    color: Brand.bg,
  },
  // Plain solid "you are here" puck — the gap-free fallback shown as a native
  // Marker child until the baked avatar bitmap is ready. Solid colours only (no
  // async image) so the marker snapshot can't flash white.
  fallbackPuck: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: Brand.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackPuckHot: {
    borderColor: Brand.purple,
  },
  fallbackPuckDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Brand.teal,
  },
  avatarDebug: {
    position: 'absolute',
    left: 8,
    zIndex: 200,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  avatarDebugText: {
    color: '#fff',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  sheetScroll: {
    flexShrink: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.teal,
    paddingVertical: Spacing.two + 2,
    borderRadius: BrandRadius.control,
    marginBottom: Spacing.three,
  },
  directionsBtnText: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  historySection: {
    marginTop: Spacing.two,
    gap: Spacing.one + 2,
  },
  historyHeading: {
    fontSize: 14,
    color: Brand.ink,
    marginBottom: Spacing.one,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,36,33,0.1)',
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  sheetTitle: {
    fontSize: 18,
    color: Brand.ink,
    flexShrink: 1,
  },
  closeButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(42,36,33,0.1)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    marginBottom: -2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Brand.purple,
  },
  tabText: {
    fontSize: 14,
  },

  // Sheet body
  sheetBody: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    flexShrink: 1,
  },

  // Carousel
  carouselWrapper: {
    position: 'relative',
    height: 150,
    borderRadius: BrandRadius.control,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  carouselImage: {
    width: CAROUSEL_WIDTH,
    height: 150,
    borderRadius: BrandRadius.control,
    backgroundColor: Brand.surface,
  },
  paginationRow: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(252,240,232,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BrandRadius.pill,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: BrandRadius.pill,
    gap: 4,
  },
  xpStatPill: {
    backgroundColor: '#ffdf34',
    borderWidth: 1,
    borderColor: '#ffae34',
  },
  xpStatText: {
    fontSize: 12,
    color: '#b46c00',
  },
  distStatPill: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: 'rgba(42,36,33,0.15)',
  },
  distStatText: {
    fontSize: 12,
    color: Brand.ink,
  },
  reachStatPill: {
    backgroundColor: 'rgba(129,65,220,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(129,65,220,0.25)',
  },
  reachStatText: {
    fontSize: 12,
    color: Brand.purple,
  },

  // Address + description
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.three,
  },
  visitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(129,65,220,0.08)',
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: BrandRadius.control,
    gap: Spacing.one,
    marginBottom: Spacing.three,
    alignSelf: 'flex-start',
  },
  visitedText: {
    fontSize: 12,
    color: Brand.purple,
  },

  // History tab
  emptyHistory: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  emptyHistoryText: {
    fontSize: 13,
    textAlign: 'center',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    backgroundColor: '#fffdfb',
    borderRadius: BrandRadius.control,
    padding: Spacing.one + 4,
    marginBottom: Spacing.one + 2,
  },
  historyCardBorder: {
    borderColor: 'rgba(42,36,33,0.2)',
  },
  historyThumb: {
    width: 80,
    height: 100,
    borderRadius: BrandRadius.control,
    backgroundColor: Brand.surface,
  },
  historyInfo: {
    flex: 1,
    gap: Spacing.two,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  historyDate: {
    fontSize: 14,
    color: Brand.ink,
  },
  historyTime: {
    fontSize: 14,
  },
  historyPoints: {
    fontSize: 14,
    color: '#e59824',
  },

  // "Ready again" nudge above the CTA once a prior check-in is off cooldown.
  recheckPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: Spacing.two,
  },
  recheckText: {
    fontSize: 13,
    flex: 1,
  },
  // Reassuring explainer under the disabled CTA while cooling down.
  cooldownHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: Spacing.two,
  },
  cooldownHintText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  // CTA
  ctaWrapper: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,36,33,0.1)',
  },
  checkInBtn: {
    backgroundColor: Brand.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: BrandRadius.control,
    gap: Spacing.one + 2,
  },
  checkInBtnDisabled: {
    backgroundColor: Brand.inkSubtle,
    opacity: 0.85,
  },
  checkInBtnText: {
    fontSize: 13,
    letterSpacing: 0.65,
  },
});
