import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, View, Text } from 'react-native';
import Animated, { Easing, FadeOut, Keyframe } from 'react-native-reanimated';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const DURATION = 600;

// Tiny build marker on the boot splash so a field tester can see at a glance that
// a new bundle actually landed. The app version alone never changes across OTA
// updates, so we append the short OTA update id — that part changes with every
// `eas update` ("embedded" until one applies). Computed once at module load;
// Updates.* are synchronous constants (null in dev → reads "v… · embedded").
const APP_VERSION = Constants.expoConfig?.version ?? '?';
const OTA_ID =
  Updates.isEmbeddedLaunch || !Updates.updateId ? 'embedded' : Updates.updateId.slice(0, 8);
const BUILD_LABEL = `v${APP_VERSION} · ${OTA_ID}`;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  // Cream splash that CONTINUES the native expo-splash-screen (same #FCF0E8 bg +
  // logo) so the OS→JS hand-off is seamless, and carries the build marker so a
  // field tester can confirm which bundle is live. It is rendered INSTANTLY at
  // full opacity — no entering animation, no image crossfade — so the marker
  // snaps in (never fades in). It just holds for a readable beat, then fades out.
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1100);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <Animated.View exiting={FadeOut.duration(400)} style={styles.backgroundSolidColor}>
      <Image
        source={require('@/assets/images/splash-icon.png')}
        style={styles.splashIcon}
        contentFit="contain"
        transition={0}
      />
      <Text style={styles.buildLabel}>{BUILD_LABEL}</Text>
    </Animated.View>
  );
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View entering={keyframe.duration(DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  image: {
    position: 'absolute',
    width: 76,
    height: 71,
  },
  background: {
    borderRadius: 40,
    experimental_backgroundImage: `linear-gradient(180deg, #3C9FFE, #0274DF)`,
    width: 128,
    height: 128,
    position: 'absolute',
  },
  backgroundSolidColor: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FCF0E8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  splashIcon: {
    width: 200,
    height: 200,
  },
  buildLabel: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(60,40,70,0.45)',
    fontSize: 12,
    letterSpacing: 0.4,
  },
});
