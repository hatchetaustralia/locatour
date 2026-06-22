import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  useFonts,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { checkLevelingInvariants } from '@/utils/leveling';
import { syncAccount, uploadPendingCheckIns, ensureHomeCoordinates } from '@/utils/account';
// Side-effect import: registers the background geofencing task + the foreground
// notification handler at module load — including the headless re-launch the OS
// uses to deliver a geofence event while the app is closed (spec 08, Phase 2).
import '@/utils/geofencing';

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
  useEffect(() => {
    void syncAccount();
    void uploadPendingCheckIns();
    // Backfill base coordinates for profiles created before we captured them, so
    // the map can warm-start at the user's home (fail-soft; no-op if already set).
    void ensureHomeCoordinates();
  }, []);

  // Deep-link a tapped proximity notification straight to the map with that
  // location pre-selected + ready to check in (spec 08, Phase 2). The geofence
  // task stamps the region identifier ("type::name::id") into the payload; we
  // pull the id back out here. Handles both a running app and a cold start.
  useEffect(() => {
    const openFromNotification = (response: Notifications.NotificationResponse | null) => {
      const identifier = response?.notification?.request?.content?.data?.identifier;
      if (typeof identifier !== 'string') return;
      const id = identifier.split('::')[2];
      if (!id) return;
      // Defer a tick so the navigator is mounted on a cold start.
      setTimeout(() => router.push({ pathname: '/explore', params: { selectedId: id } }), 0);
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
