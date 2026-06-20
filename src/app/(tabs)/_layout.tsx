import React from 'react';

import AppTabs from '@/components/app-tabs';

// The tab bar lives in this group so that auth/onboarding routes can sit as
// siblings under the root Stack (see app/_layout.tsx) and render full-screen
// outside the tabs.
export default function TabsLayout() {
  return <AppTabs />;
}
