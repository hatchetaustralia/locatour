import React, { useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandAssets, BrandText, Sticker, StampButton, StampInput } from '@/components/brand';
import { LocatourMark } from '@/components/locatour-mark';
import { Brand } from '@/constants/theme';
import { signInWithGoogle, needsOnboarding } from '@/utils/account';
import { storage } from '@/utils/storage';

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Design board is 400px wide; clamp the content column the same way.
  const colWidth = Math.min(300, width - 48);

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
      {/* Passport-stamp stickers clustered across the top (bleed off the top
          edge like the Figma board; kept clear of the centred content below) */}
      <View pointerEvents="none" style={styles.stickerLayer}>
        <Sticker kind="camera" size={146} style={[styles.sticker, { top: -6, left: -34 }]} />
        <Sticker kind="hiking" size={92} style={[styles.sticker, { top: 30, left: 78 }]} />
        <Sticker kind="hat" size={158} style={[styles.sticker, { top: -18, left: 214 }]} />
        {/* Anchored to the right edge so it always bleeds cleanly off-screen on
            any width (no hard right edge shown), rather than a fixed left that
            lands on-screen on wider phones. */}
        <Sticker kind="boot" size={96} style={[styles.sticker, { top: 30, right: -22 }]} />
      </View>

      <View style={[styles.column, { width: colWidth }]}>
        <View style={styles.brandLockup}>
          <LocatourMark size={66} color={Brand.ink} />
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
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    height: 150,
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
