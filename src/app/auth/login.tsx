import React, { useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandAssets, BrandText, Sticker, StampButton, StampInput } from '@/components/brand';
import { Brand } from '@/constants/theme';

// Mock identities a "real" SSO provider would return — makes the demo social
// login feel authentic without any real OAuth.
// TODO: replace with real SSO (Google/Apple) wired to the backend in a later phase.
const SSO_NAMES = ['Jordan Avery', 'Sam Taylor', 'Riley Morgan', 'Casey Nguyen', 'Alex Brooks'];
function makeMockIdentity(platform: 'google' | 'apple') {
  const name = SSO_NAMES[Math.floor(Math.random() * SSO_NAMES.length)];
  const handle = name.toLowerCase().replace(/\s+/g, '.');
  const domain = platform === 'apple' ? 'icloud.com' : 'gmail.com';
  return {
    name,
    email: `${handle}@${domain}`,
    avatarUrl: `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(name)}&backgroundColor=c0aede`,
  };
}

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

  const handleSocialLogin = (platform: 'google' | 'apple') => {
    if (connecting) return;
    setConnecting(platform);
    setTimeout(() => {
      const identity = makeMockIdentity(platform);
      setConnecting(null);
      router.push({
        pathname: '/auth/profile',
        params: {
          provider: platform,
          displayName: identity.name,
          email: identity.email,
          avatarUrl: identity.avatarUrl,
        },
      });
    }, 1300);
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Passport-stamp stickers clustered across the top (bleed off the top
          edge like the Figma board; kept clear of the centred content below) */}
      <View pointerEvents="none" style={styles.stickerLayer}>
        <Sticker kind="camera" size={146} style={[styles.sticker, { top: -6, left: -34 }]} />
        <Sticker kind="hiking" size={92} style={[styles.sticker, { top: 30, left: 78 }]} />
        <Sticker kind="hat" size={158} style={[styles.sticker, { top: -18, left: 226 }]} />
        <Sticker kind="boot" size={96} style={[styles.sticker, { top: 34, left: 312 }]} />
      </View>

      <View style={[styles.column, { width: colWidth }]}>
        <Image source={BrandAssets.logo} style={styles.logo} resizeMode="contain" />

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
            onPress={() => handleSocialLogin('google')}
          />
          <StampButton
            variant="dark"
            label={connecting === 'apple' ? 'Connecting…' : 'Sign in with Apple'}
            icon={connecting === 'apple' ? undefined : 'logo-apple'}
            loading={connecting === 'apple'}
            disabled={!!connecting}
            onPress={() => handleSocialLogin('apple')}
          />
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <BrandText weight="medium" color={Brand.inkSecondary} style={styles.dividerText}>OR</BrandText>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.group}>
          <StampInput
            icon="mail-outline"
            placeholder="Your email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError('');
            }}
          />
          {/* Passwordless: email gets a magic sign-in link / one-time code,
              so there is no password field (overrides the Figma frame). */}
          {error ? <BrandText weight="medium" style={styles.error}>{error}</BrandText> : null}

          <View style={styles.cta}>
            <StampButton variant="primary" label="SEND SIGN-IN LINK" onPress={handleLogin} />
            <BrandText weight="medium" color={Brand.link} style={styles.linkRow}>
              No account? <BrandText weight="medium" color={Brand.purple}>Create one</BrandText>
            </BrandText>
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
