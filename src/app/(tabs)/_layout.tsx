import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { LocationProvider } from '@/context/location-context';
import { Brand } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { needsOnboarding } from '@/utils/account';
import { User } from '@/types';

// Land on the MAP (the `index` route, i.e. `/`) instead of home when the app
// enters this group — the map IS the index now, so the launch URL `/` resolves
// straight to it. `initialRouteName` pins the tab navigator's anchor / initial
// trigger to `index` (see app-tabs.tsx's expo-router/ui Tabs, which sorts
// triggers by this route node's initialRouteName). Home stays reachable via its
// tab (`/home`).
export const unstable_settings = {
  initialRouteName: 'index',
};

// The tab bar lives in this group so that auth/onboarding routes can sit as
// siblings under the root Stack (see app/_layout.tsx) and render full-screen
// outside the tabs. LocationProvider wraps the whole group so ONE GPS watch +
// ONE located-locations fetch + the hidden-spot-nearby readout are shared across
// home/map/camera and persist across tab navigation (no re-poll per screen).
//
// This layout is also the single startup chokepoint for the auth + onboarding
// gate: EVERY in-app screen renders under it, while the `auth/*` login and
// onboarding screens are SIBLINGS outside `(tabs)`. So redirecting an
// un-onboarded user away from here lands on a sibling route and CANNOT re-enter
// this layout — no redirect loop (the gate only runs for the tab group, not for
// the destinations it redirects to).
export default function TabsLayout() {
  // undefined = still hydrating from the SQLite kv store (show a loader);
  // null = resolved, no signed-in user (→ login).
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    storage.getUser().then((u) => {
      if (active) setUser(u);
    });
    return () => {
      active = false;
    };
  }, []);

  // Hydrating — match the tab screens' loading idiom (pink spinner on cream bg).
  if (user === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Brand.sticker.pink} />
      </View>
    );
  }

  // Not signed in, OR a zombie session — a user is present but the Sanctum token
  // was cleared after the server 401'd it (stale token). Either way → LOGIN, so
  // re-authenticating mints a fresh token instead of sitting on stale, un-syncable
  // local data (which silently no-op'd every resync).
  if (!user || !storage.getToken()) {
    return <Redirect href="/auth/login" />;
  }

  // Signed in but onboarding never finished (no home base / default profile) →
  // run the onboarding story before letting them into the app.
  if (needsOnboarding(user)) {
    return <Redirect href="/auth/walkthrough" />;
  }

  return (
    <LocationProvider>
      <AppTabs />
    </LocationProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
