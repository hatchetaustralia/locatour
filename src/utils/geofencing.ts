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
import { Platform } from 'react-native';

import { storage } from './storage';
import { maxDiscoverableTier, unlockedTier, WARM_RADIUS_M } from './leveling';

export const GEOFENCE_TASK = 'locatour-geofence';
const CHANNEL_ID = 'geofence-alerts';
/** Separator packed into the region identifier: `type::name::id`. Names never contain it. */
const SEP = '::';
/** Android allows up to 100 active geofences per app; stay under it. */
const MAX_REGIONS = 90;

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

  const [type, name] = (region.identifier ?? '').split(SEP);

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
    const maxDisc = maxDiscoverableTier(level);
    const visited = new Set(checkIns.map((c) => c.locationId));

    const regions: Location.LocationRegion[] = [];
    for (const loc of locations) {
      if (visited.has(loc.id)) continue; // only nudge for never-checked-in spots
      if (loc.tier > maxDisc) continue; // secret tier — never surface
      const hidden = loc.tier > maxUnlocked; // discoverable but not yet unlocked
      regions.push({
        // Pack everything the headless task needs; hide the name for hidden spots.
        identifier: `${hidden ? 'hidden' : 'unlocked'}${SEP}${hidden ? '' : loc.name}${SEP}${loc.id}`,
        latitude: loc.coordinates.latitude,
        longitude: loc.coordinates.longitude,
        // Hidden: a wide "warm" ring so the hint fires before they arrive.
        // Unlocked: the check-in radius, floored to a geofence-reliable minimum.
        radius: hidden ? WARM_RADIUS_M : Math.max(loc.geofenceRadius ?? 150, 120),
        notifyOnEnter: true,
        notifyOnExit: false,
      });
      if (regions.length >= MAX_REGIONS) break;
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
 * Call on app focus. Prompts for permission exactly once (when still
 * undetermined) so existing users who skip the walkthrough still get asked;
 * afterwards it only re-syncs the monitored set — no repeated Settings trips.
 */
export async function refreshGeofencesOnFocus(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      // Already authorized — just re-arm the monitored set.
      await syncGeofences();
      return;
    }
    // Not yet authorized: run the full prompt chain once, while we've never
    // asked (foreground still undetermined). Otherwise stay quiet so we don't
    // nag on every focus or bounce the user to Settings repeatedly.
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status === 'undetermined') {
      await setupGeofencing();
    }
  } catch (e) {
    console.warn('[geofence] refresh failed', (e as Error).message);
  }
}
