import React, { useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Keyframe } from 'react-native-reanimated';

import { BrandAssets, BrandText, Sticker, StampButton, StampInput } from '@/components/brand';
import { Brand } from '@/constants/theme';
import { signInWithGoogle, needsOnboarding } from '@/utils/account';
import { storage } from '@/utils/storage';

// Passport-stamp entrance: a quiet fade-in with a barely-there settle (no bounce).
// Each sharp stamp uses a later delay so they appear one after another, like a
// passport getting stamped. A fresh Keyframe is built per stamp (delay differs).
const stampIn = (delay: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ scale: 1.05 }] },
    100: { opacity: 1, transform: [{ scale: 1 }] },
  })
    .duration(450)
    .delay(delay);

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Design board is 400px wide; clamp the content column the same way.
  const colWidth = Math.min(300, width - 48);

  // Soft, out-of-focus stamps behind everything for depth — big, clearly visible,
  // sitting in the open space above the logo and below the form (incl. the teal/blue
  // one). They only fade in (no stamp), so they read as "background".
  const blurStamps = [
    // small soft teal coin tucked just above the Google button (left side)
    { kind: 'teal' as const, size: 54, opacity: 0.55, pos: { top: '39%', left: width * 0.04 } },
    // larger soft yellow coin hanging off the right edge, mid-screen
    { kind: 'hiking' as const, size: 150, opacity: 0.5, pos: { top: '50%', right: -56 } },
  ];
  // Sharp stamps tucked into the four corners, FULLY on-screen (small positive
  // margins) so none of them is clipped by a screen edge. Top ones sit below the
  // status bar, bottom ones below the form text. `delay` lands them one after
  // another (the passport-stamp sequence).
  const sharpStamps = [
    { kind: 'boot' as const, size: 86, delay: 0, pos: { top: insets.top + 10, left: 6 } },
    { kind: 'camera' as const, size: 114, delay: 150, pos: { top: insets.top + 12, right: 6 } },
    { kind: 'hat' as const, size: 114, delay: 300, pos: { bottom: insets.bottom + 10, left: 6 } },
    { kind: 'hiking' as const, size: 90, delay: 450, pos: { bottom: insets.bottom + 8, right: 6 } },
  ];

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState<'google' | 'apple' | null>(null);

  const handleLogin = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    // Auth is mocked — continue to the OTP step of onboarding.
    router.push({ pathname: '/auth/otp', params: { email } });
  };

  const handleGoogleSignIn = async () => {
    if (connecting) return;
    setError('');
    setConnecting('google');
    try {
      const result = await signInWithGoogle();
      if (result.ok) {
        // Route on the freshly-synced LOCAL user, not the server's `is_new` flag:
        // a pre-existing account can still be missing onboarding (no home base /
        // default @explorer), and the server reports it as not-new. Anyone who
        // hasn't completed onboarding runs the story first (walkthrough → profile →
        // customize); a fully-onboarded user goes straight into the app (the MAP).
        const localUser = await storage.getUser();
        router.replace(needsOnboarding(localUser) ? '/auth/walkthrough' : '/');
        return;
      }
      if (result.reason === 'cancelled') return; // user backed out — not an error
      setError(
        result.reason === 'unconfigured'
          ? 'Google sign-in isn’t set up yet.'
          : result.reason === 'play_services'
            ? 'Google Play Services is unavailable on this device.'
            : result.reason === 'offline'
              ? 'Couldn’t reach the server — check your connection and try again.'
              : 'Google sign-in failed. Please try again.',
      );
    } finally {
      setConnecting(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Passport-stamp stickers scattered around the whole screen (bleeding off
          every edge like the Figma board), with soft out-of-focus copies behind
          for depth. The sharp ones "stamp" in one after another on mount — like a
          passport getting stamped. Kept to the corners/edges so the centred
          content below stays clear. */}
      <View pointerEvents="none" style={styles.stickerLayer}>
        {blurStamps.map((s, i) => (
          <View key={`blur-${i}`} style={[styles.sticker, s.pos as object, { opacity: s.opacity }]}>
            <Sticker kind={s.kind} size={s.size} blur />
          </View>
        ))}
        {sharpStamps.map((s, i) => (
          <Animated.View key={`sharp-${i}`} entering={stampIn(s.delay)} style={[styles.sticker, s.pos as object]}>
            <Sticker kind={s.kind} size={s.size} />
          </Animated.View>
        ))}
      </View>

      <View style={[styles.column, { width: colWidth }]}>
        <View style={styles.brandLockup}>
          {/* Wordmark already includes the knot mark — no separate LocatourMark above it. */}
          <Image source={BrandAssets.logo} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.heading}>
          <BrandText weight="semibold" style={styles.title}>Sign in</BrandText>
          <BrandText weight="medium" color={Brand.inkSecondary} style={styles.subtitle}>
            Welcome back!
          </BrandText>
        </View>

        <View style={styles.group}>
          <StampButton
            variant="dark"
            label={connecting === 'google' ? 'Connecting…' : 'Sign in with Google'}
            iconImage={connecting === 'google' ? undefined : BrandAssets.googleG}
            loading={connecting === 'google'}
            disabled={!!connecting}
            onPress={handleGoogleSignIn}
          />
          {/* Apple is grayed out for now — Google is the only live provider. */}
          <View style={styles.comingSoon} pointerEvents="none">
            <StampButton
              variant="dark"
              label="Sign in with Apple"
              icon="logo-apple"
              disabled
              onPress={() => {}}
            />
          </View>
        </View>

        {error ? (
          <BrandText weight="medium" style={styles.error}>{error}</BrandText>
        ) : null}

        {/* Email / mobile sign-in is grayed out for now — Google only. */}
        <View style={styles.comingSoon} pointerEvents="none">
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <BrandText weight="medium" color={Brand.inkSecondary} style={styles.dividerText}>OR</BrandText>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.group}>
            <StampInput
              icon="call-outline"
              placeholder="Your mobile number"
              keyboardType="phone-pad"
              autoCapitalize="none"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError('');
              }}
            />
            {/* Mobile sign-up: a one-time SMS code (no password). SMS isn't wired
                up yet, so this whole section is grayed out for now. */}

            <View style={styles.cta}>
              <StampButton variant="primary" label="SEND CODE" onPress={handleLogin} />
              <BrandText weight="medium" color={Brand.link} style={styles.linkRow}>
                No account? <BrandText weight="medium" color={Brand.purple}>Sign up with mobile</BrandText>
              </BrandText>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sticker: {
    position: 'absolute',
  },
  column: {
    alignItems: 'center',
    gap: 28,
  },
  brandLockup: {
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    width: 179,
    height: 35,
  },
  heading: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
  },
  subtitle: {
    fontSize: 14,
  },
  group: {
    width: '100%',
    gap: 12,
  },
  // Grayed-out, non-interactive providers (Apple + email/mobile) until they're live.
  comingSoon: {
    width: '100%',
    gap: 12,
    opacity: 0.4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Brand.inkSubtle,
  },
  dividerText: {
    fontSize: 14,
  },
  error: {
    color: '#d1453b',
    fontSize: 13,
  },
  cta: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  linkPrimary: {
    fontSize: 14,
  },
  linkRow: {
    fontSize: 14,
  },
});
