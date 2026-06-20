import { Stack } from 'expo-router';
import React from 'react';

// Groups the onboarding screens (login → otp → profile → customize) into a
// single "auth" stack so the root navigator's `auth` route resolves and each
// step gets native push/pop transitions.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
