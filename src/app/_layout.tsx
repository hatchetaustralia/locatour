import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  useFonts,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { checkLevelingInvariants } from '@/utils/leveling';
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
  // Poppins is the brand typeface (Figma "Mobile UI 2"). Hold render until it
  // loads so screens don't flash the system font first.
  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

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
