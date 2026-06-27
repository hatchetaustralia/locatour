/**
 * geofencing.ts — background proximity notifications (spec 08, Phase 2).
 *
 * Registers a geofence around every nearby spot the user has NEVER checked in
 * at, and fires a local notification when they walk into one — even if the app
 * is closed. Two flavours, by tier:
 *   • UNLOCKED spot (tier ≤ their level)         → "There's a spot nearby!"
 *   • HIDDEN spot   (tier ≤ level + 3, discoverable but not yet unlocked)
 *                                                → "Closing in… 🔍" (no name — don't leak it)
 * Spots beyond the discoverable range are SECRET: never registered, never hinted.
 *
 * Background execution requires a dev/standalone build (TaskManager is not
 * available in Expo Go on Android) and a PHYSICAL device — emulators have no
 * Google Play Services geofencing. So this is validated on-device, not in CI.
 *
 * The task handler is deliberately PURE: everything it needs to build the
 * notification is packed into the region identifier (`type::name::id`) at
 * registration time, so it never has to touch storage in the headless context.
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { storage } from './storage';
import { unlockedTier } from './leveling';
import { getConfig, tierRadiusBoost } from './runtime-config';
import { distanceMeters } from './geo';

export const GEOFENCE_TASK = 'locatour-geofence';
const CHANNEL_ID = 'geofence-alerts';
/** Separator packed into the region identifier: `type::name::id`. Names never contain it. */
const SEP = '::';
/** OS cap on active geofences: Android ~100 (stay under), iOS ~20 per app. The
 *  hidden-first nearest ranking puts the most valuable regions in the limited
 *  slots, so a smaller iOS cap still keeps the right ones. */
const MAX_REGIONS = Platform.OS === 'ios' ? 20 : 90;

// ── Notification throttling (best-practice: a rare delight, never spam) ──
/** Don't re-notify the SAME spot within this window (~1 month). */
const NOTIFY_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/** Max nearby pings per calendar day. */
const MAX_PER_DAY = 3;
/** Quiet hours (local): suppress pings from 21:00 up to 08:00. */
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 8;

// A tiny, dedicated SQLite store for throttle state, separate from the main app
// DB so it's safe to read/write from the HEADLESS geofence task. Holds one JSON
// row: { lastBySpot: {id: ms}, day: 'YYYY-MM-DD', count }.
type ThrottleState = { lastBySpot: Record<string, number>; day: string; count: number };
let throttleDb: SQLite.SQLiteDatabase | null = null;
function getThrottleDb(): SQLite.SQLiteDatabase {
  if (!throttleDb) {
    throttleDb = SQLite.openDatabaseSync('locatour-geofence.db');
    throttleDb.execSync('CREATE TABLE IF NOT EXISTS throttle (key TEXT PRIMARY KEY, value TEXT)');
  }
  return throttleDb;
}
function readThrottle(): ThrottleState {
  try {
    const row = getThrottleDb().getFirstSync<{ value: string }>(
      'SELECT value FROM throttle WHERE key = ?',
      ['state']
    );
    if (row?.value) return JSON.parse(row.value) as ThrottleState;
  } catch {
    // ignore — fall through to a fresh state
  }
  return { lastBySpot: {}, day: '', count: 0 };
}
function writeThrottle(state: ThrottleState): void {
  try {
    getThrottleDb().runSync('INSERT OR REPLACE INTO throttle (key, value) VALUES (?, ?)', [
      'state',
      JSON.stringify(state),
    ]);
  } catch {
    // ignore — worst case we under-throttle, never crash the headless task
  }
}

/**
 * Decide whether to fire a nearby-spot notification for `spotId` right now, and
 * record it if so. Enforces: quiet hours, a per-spot ~30-day cooldown, and a
 * per-day cap — so the feature stays a rare, exciting nudge, not a nag.
 */
function shouldNotify(spotId: string): boolean {
  const now = new Date();
  const hour = now.getHours();
  // Quiet hours wrap past midnight (21:00 → 08:00).
  const inQuiet =
    QUIET_START_HOUR > QUIET_END_HOUR
      ? hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
      : hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR;
  if (inQuiet) return false;

  const state = readThrottle();
  const today = now.toISOString().slice(0, 10);
  if (state.day !== today) {
    state.day = today;
    state.count = 0; // new day → reset the daily counter
  }
  if (state.count >= MAX_PER_DAY) return false;
  if (now.getTime() - (state.lastBySpot[spotId] ?? 0) < NOTIFY_COOLDOWN_MS) return false;

  state.lastBySpot[spotId] = now.getTime();
  state.count += 1;
  writeThrottle(state);
  return true;
}

// ── Foreground display: show banners even while the app is open. SDK 53+ split
// the old `shouldShowAlert` into `shouldShowBanner` / `shouldShowList`.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── The background task. MUST be defined at module top-level so it is
// registered when the JS bundle loads (including the headless re-launch the OS
// uses to deliver a geofence event). Pure: reads only the region identifier.
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[geofence] task error', error.message);
    return;
  }
  const { eventType, region } = (data ?? {}) as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };
  if (eventType !== Location.GeofencingEventType.Enter) return;

  const [type, name, id] = (region.identifier ?? '').split(SEP);

  // Throttle: quiet hours, per-spot ~30-day cooldown, daily cap — keep it a rare
  // delight, not a nag (and a commuter passing the same park isn't pinged daily).
  if (!shouldNotify(id ?? region.identifier ?? '')) return;

  let title: string;
  let body: string;
  if (type === 'hidden') {
    title = 'Closing in… 🔍';
    body = "Looks like you're near something hidden. Keep exploring 👀";
  } else {
    title = '📍 Spot nearby!';
    body = name ? `You're near ${name} — go check in for XP!` : "There's a spot nearby — go check in!";
  }

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { identifier: region.identifier } },
    trigger: null, // deliver immediately
  });
});

/**
 * Ask for the permissions geofencing needs, in the order the OS requires:
 * foreground location → notification channel → notification permission →
 * background location (which, on Android 11+, sends the user to Settings to
 * pick "Allow all the time"). Returns true when we can monitor in the
 * background; false (but still usable in-foreground) otherwise.
 */
export async function ensureGeofencePermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;

  if (Platform.OS === 'android') {
    // The channel must exist before the POST_NOTIFICATIONS prompt will appear.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Nearby spots',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#7C5CFF',
    });
  }
  await Notifications.requestPermissionsAsync();

  // Do this LAST — on Android 11+ it leaves the app for the Settings screen.
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted';
}

/** The TRUE state of Nearby Alerts, combining the stored opt-in with the real OS
 *  permissions. The stored toggle alone can LIE: the user can revoke "Allow all
 *  the time" location (or notifications) in Settings while our flag still reads
 *  on, leaving geofencing silently dead. The UI uses this so it never claims the
 *  feature is active when the OS won't actually deliver a ping.
 *   • 'on'              → opted in AND background location AND notifications granted
 *   • 'needs-permission'→ opted in BUT a required OS permission is missing
 *   • 'off'             → not opted in (the switch is off) */
export type NearbyAlertsStatus = 'on' | 'needs-permission' | 'off';

/**
 * Read the true Nearby Alerts status WITHOUT prompting. Combines the stored
 * toggle with the OS background-location + notification permissions (all read
 * via their `get*` accessors, which never surface a dialog). Web has no
 * background geofencing, so it's always 'off'.
 */
export async function getNearbyAlertsStatus(): Promise<NearbyAlertsStatus> {
  if (Platform.OS === 'web') return 'off';
  if (!storage.getNearbyAlertsEnabled()) return 'off'; // switch is off → neutral
  try {
    const [bg, notif] = await Promise.all([
      Location.getBackgroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);
    // Both must be granted for a ping to actually fire: geofencing needs "Allow
    // all the time", and a granted notification permission to surface the alert.
    return bg.granted && notif.granted ? 'on' : 'needs-permission';
  } catch {
    // Can't read permissions → treat as needing attention rather than claim "on".
    return 'needs-permission';
  }
}

/**
 * (Re)register geofences for every discoverable, never-visited spot. Idempotent:
 * stops any existing run first, so calling it after a check-in or level-up keeps
 * the monitored set current. Silently no-ops without foreground permission.
 */
export async function syncGeofences(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // Geofencing needs "Allow all the time" — startGeofencingAsync rejects with
    // foreground-only access. Gate on background so we never make a doomed call.
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return;

    const [user, locations, checkIns] = await Promise.all([
      storage.getUser(),
      storage.getLocations(),
      storage.getCheckIns(),
    ]);
    if (!user) return;

    const level = user.stats.currentLevel;
    const maxUnlocked = unlockedTier(level);
    const discoveryFloor = maxUnlocked + getConfig().lockTeaserRange; // genuinely-hidden band is above this
    const visited = new Set(checkIns.map((c) => c.locationId));

    // Centre to rank by: a cheap last-known fix (no GPS spin-up in the background)
    // or the user's home base. Without one we keep source order (dist 0 for all).
    const center =
      (await Location.getLastKnownPositionAsync().catch(() => null))?.coords ??
      user.homeCoordinates ??
      null;

    type Candidate = { region: Location.LocationRegion; hidden: boolean; dist: number };
    const candidates: Candidate[] = [];
    for (const loc of locations) {
      if (visited.has(loc.id)) continue; // only nudge for never-checked-in spots
      // No secret-tier ceiling: a remote high-tier spot is discoverable by proximity.
      const hidden = loc.tier > discoveryFloor; // genuinely hidden (above the locked teasers)
      // Skip the visible-but-locked teaser band (maxUnlocked < tier <= discoveryFloor):
      // a map pin, not checkable and not hidden — no geofence "hidden nearby" nudge.
      if (loc.tier > maxUnlocked && ! hidden) continue;
      candidates.push({
        hidden,
        dist: center ? distanceMeters(center, loc.coordinates) : 0,
        region: {
          // Pack everything the headless task needs; hide the name for hidden spots.
          identifier: `${hidden ? 'hidden' : 'unlocked'}${SEP}${hidden ? '' : loc.name}${SEP}${loc.id}`,
          latitude: loc.coordinates.latitude,
          longitude: loc.coordinates.longitude,
          // Hidden: a wide "warm" ring so the hint fires before they arrive.
          // Unlocked: the check-in radius, floored to a geofence-reliable minimum.
          radius: hidden
            ? getConfig().warmRadiusM * tierRadiusBoost(level)
            : Math.max(loc.geofenceRadius ?? 150, 120),
          notifyOnEnter: true,
          notifyOnExit: false,
        },
      });
    }

    // The OS caps active geofences (~20 iOS / 100 Android), so in a dense area we
    // can't register them all. Register the NEAREST to where the user is now, and
    // let HIDDEN spots claim slots FIRST — the discovery ping is the whole point, so
    // nearer already-unlocked spots must never crowd hidden ones out of the cap.
    // Within each group, nearest wins. (Stable order is kept when center is null.)
    const byDist = (a: Candidate, b: Candidate) => a.dist - b.dist;
    const ranked = [
      ...candidates.filter((c) => c.hidden).sort(byDist),
      ...candidates.filter((c) => !c.hidden).sort(byDist),
    ];
    const regions = ranked.slice(0, MAX_REGIONS).map((c) => c.region);
    if (candidates.length > MAX_REGIONS) {
      console.log(
        `[geofence] ${candidates.length} candidates exceed the ${MAX_REGIONS} cap → registered the nearest (hidden-first); some far spots are not monitored in the background.`,
      );
    }

    const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    if (regions.length > 0) {
      await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    }
  } catch (e) {
    console.warn('[geofence] sync failed', (e as Error).message);
  }
}

/** First-run entry point: request permissions, then register geofences. */
export async function setupGeofencing(): Promise<void> {
  await ensureGeofencePermissions();
  await syncGeofences();
}

/**
 * Call on app focus. OPT-IN ONLY: background geofencing runs solely when the user
 * has enabled Nearby Alerts. We NEVER proactively prompt for "Allow all the time"
 * location (an adoption killer + a Play-Store review hurdle) — that request only
 * happens via enableNearbyAlerts(), behind a prominent in-app disclosure.
 */
export async function refreshGeofencesOnFocus(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!storage.getNearbyAlertsEnabled()) return; // not opted in → do nothing, no prompt
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      await syncGeofences(); // re-arm the monitored set
    } else {
      // Permission revoked in Settings → reflect that the feature is now off.
      storage.setNearbyAlertsEnabled(false);
    }
  } catch (e) {
    console.warn('[geofence] refresh failed', (e as Error).message);
  }
}

/**
 * Turn ON background Nearby Alerts. The UI MUST show the prominent disclosure
 * first; this then runs the OS permission chain (on Android 11+ that sends the
 * user to Settings to pick "Allow all the time"). Returns true if background
 * access was granted and geofences were armed.
 */
export async function enableNearbyAlerts(): Promise<boolean> {
  const granted = await ensureGeofencePermissions();
  storage.setNearbyAlertsEnabled(granted);
  if (granted) await syncGeofences();
  return granted;
}

/** Turn OFF Nearby Alerts: clear the preference + stop background monitoring. */
export async function disableNearbyAlerts(): Promise<void> {
  storage.setNearbyAlertsEnabled(false);
  if (Platform.OS === 'web') return;
  try {
    const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
  } catch (e) {
    console.warn('[geofence] disable failed', (e as Error).message);
  }
}
