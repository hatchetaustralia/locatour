import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  useFonts,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import React, { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { checkLevelingInvariants } from '@/utils/leveling';
import { syncAccount, uploadPendingCheckIns, ensureHomeCoordinates, flushOutbox, setSessionExpiredHandler } from '@/utils/account';
// Side-effect import registers the background geofencing task + foreground
// notification handler at module load (incl. the headless re-launch the OS uses
// to deliver a geofence event while the app is closed, spec 08, Phase 2).
// `refreshGeofencesOnFocus` re-arms the monitored set as the user moves.
import { refreshGeofencesOnFocus } from '@/utils/geofencing';

// Hide the native splash with NO fade-out (duration 0). Default is a 400ms fade,
// which dissolves the native splash over the JS splash overlay beneath — making
// the build marker (only on the JS layer) appear to "fade in". Instant hide =
// the marker snaps in. Called in global scope (per the docs) so it's set before
// Expo Router auto-hides the splash. `fade` is iOS-only; `duration` covers both.
SplashScreen.setOptions({ duration: 0, fade: false });

// Dev-only self-check: fail loudly in the console if the OSRS leveling curve or
// tier/point constants ever drift from the spec (leveling.ts is the single
// source of truth). No-op in production builds.
if (__DEV__) {
  const failures = checkLevelingInvariants();
  if (failures.length > 0) {
    console.error('[leveling] invariant check FAILED:\n' + failures.join('\n'));
  }
}

// Root navigator is a Stack so the tab group `(tabs)` and the `auth`
// onboarding screens are siblings. Onboarding renders full-screen (no tab bar);
// once a user exists, `(tabs)` is the main app.
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  // Poppins is the brand typeface (Figma "Mobile UI 2"). Hold render until it
  // loads so screens don't flash the system font first.
  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // App-start account housekeeping (fire-and-forget, never blocks render):
  //  1. push the local profile + stats to the server (self-heals to a register
  //     if the device has a user but no token yet),
  //  2. flush any check-ins that were queued while offline / on a prior failure.
  // Both are fail-soft inside account.ts, so a network error is a no-op here.
  // If the server ever 401s our token, force a re-login instead of leaving the
  // app in a zombie session (logged-in-looking but unable to sync, silently
  // showing stale local data — the exact failure mode behind admin deletes not
  // propagating). The token is already cleared at the source.
  useEffect(() => {
    setSessionExpiredHandler(() => router.replace('/auth/login'));
    return () => setSessionExpiredHandler(null);
  }, [router]);

  useEffect(() => {
    void syncAccount();
    void uploadPendingCheckIns();
    // Drain the durable mutation outbox (offline profile edits + discoveries).
    void flushOutbox();
    // Backfill base coordinates for profiles created before we captured them, so
    // the map can warm-start at the user's home (fail-soft; no-op if already set).
    void ensureHomeCoordinates();
  }, []);

  // Re-arm background geofences whenever the app becomes active — at the ROOT,
  // not just on a single screen. The Home tab also refreshes on focus, but the
  // app now cold-starts on the map (the index route) and a user can spend a
  // whole session there without ever opening Home; without this, the monitored
  // set would never re-sync as they move, so a hidden gem entered far from where
  // the geofences were last armed never fires. Opt-in + permission gated inside
  // refreshGeofencesOnFocus, so this is a no-op when Nearby Alerts is off.
  useEffect(() => {
    void refreshGeofencesOnFocus();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshGeofencesOnFocus();
        // Retry any queued mutations whenever the app returns to the foreground.
        void flushOutbox();
      }
    });
    return () => sub.remove();
  }, []);

  // Deep-link a tapped proximity notification to the map (spec 08, Phase 2). The
  // geofence task stamps the region identifier ("type::name::id") into the
  // payload; we pull the type + id back out here. Branch on the type:
  //   • UNLOCKED spot → open the map with the spot card selected + ready to
  //     check in (pass selectedId).
  //   • HIDDEN spot   → open the MAP ONLY, no selectedId — revealing/opening the
  //     card would spoil the surprise the hidden-gem nudge is meant to preserve.
  // Handles both a running app and a cold start.
  useEffect(() => {
    const openFromNotification = (response: Notifications.NotificationResponse | null) => {
      const identifier = response?.notification?.request?.content?.data?.identifier;
      if (typeof identifier !== 'string') return;
      const [type, , id] = identifier.split('::');
      // Defer a tick so the navigator is mounted on a cold start.
      if (type === 'hidden') {
        // Just open the map — don't reveal the hidden spot.
        setTimeout(() => router.push('/'), 0);
        return;
      }
      if (!id) return;
      setTimeout(() => router.push({ pathname: '/', params: { selectedId: id } }), 0);
    };

    Notifications.getLastNotificationResponseAsync().then(openFromNotification);
    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => sub.remove();
  }, [router]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth" />
        </Stack>
        <StatusBar style="dark" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
