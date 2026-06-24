import React from 'react';

import AppTabs from '@/components/app-tabs';
import { LocationProvider } from '@/context/location-context';

// The tab bar lives in this group so that auth/onboarding routes can sit as
// siblings under the root Stack (see app/_layout.tsx) and render full-screen
// outside the tabs. LocationProvider wraps the whole group so ONE GPS watch +
// ONE located-locations fetch + the hidden-spot-nearby readout are shared across
// home/map/camera and persist across tab navigation (no re-poll per screen).
export default function TabsLayout() {
  return (
    <LocationProvider>
      <AppTabs />
    </LocationProvider>
  );
}
