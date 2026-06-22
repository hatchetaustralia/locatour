/**
 * HiddenHeroCard — the big "Something Hidden Nearby" teaser.
 *
 * A LARGE invitation card that hints an UNDISCOVERED hidden spot is close by,
 * WITHOUT giving it away — no name, no photo, just a mysterious shimmer to lure
 * the explorer towards the camera/map to go find it.
 *
 * The shimmer is a live Skia rainbow sweep-gradient with a real blurred glow
 * halo (the CSS `filter: blur()` look), using the exact rainbow palette + blur
 * from shutter-button.tsx / rainbow-glow-marker.tsx so it reads as the same
 * "hidden / iridescent" cue across the app. It slowly rotates so the card feels
 * alive. expo-linear-gradient lays a soft iridescent wash across the card face.
 */
import React, { useEffect } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas,
  Group,
  Circle,
  SweepGradient,
  Paint,
  Blur,
  vec,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { BrandText } from '@/components/brand';
import { Brand, BrandRadius, Spacing, stampBorder } from '@/constants/theme';

// Same full-spectrum sweep the shutter + map glow use (wraps seamlessly with the
// first colour repeated at the end) so "hidden" looks identical everywhere.
const RAINBOW = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff3b30'];

// Skia glow canvas behind the sparkles badge. Sized so the blur fully fades
// INSIDE the canvas (otherwise the blur clips to a hard square edge).
const GLOW = 140;
const GC = GLOW / 2;
const GLOW_R = 40;
const BLUR = 8;

/** "~120 m away" under a km, otherwise one-decimal km "~1.2 km away". */
function friendlyDistance(distanceM: number): string {
  if (distanceM < 1000) {
    return `~${Math.round(distanceM)} m away`;
  }
  return `~${(distanceM / 1000).toFixed(1)} km away`;
}

export function HiddenHeroCard({
  distanceM,
  onPress,
}: {
  distanceM: number;
  onPress?: () => void;
}): React.JSX.Element {
  const rot = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    rot.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 6000, easing: Easing.linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [rot, pulse]);

  const spin = useDerivedValue(() => [{ rotate: rot.value }]);
  const glowOpacity = useDerivedValue(() => 0.45 + pulse.value * 0.3);
  const glowGrow = useDerivedValue(() => [{ scale: 1 + pulse.value * 0.06 }]);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.card, stampBorder]}
    >
      {/* Soft iridescent wash across the whole card face. */}
      <LinearGradient
        colors={['#FFE9F2', '#EAF6FF', '#F3ECFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* The mysterious shimmer badge: a blurred rainbow halo with a sparkles
          icon floating on top. Never reveals the spot — just teases it. */}
      <View style={styles.badge}>
        <Canvas style={styles.glowCanvas} pointerEvents="none">
          <Group
            origin={vec(GC, GC)}
            transform={glowGrow}
            opacity={glowOpacity}
            layer={
              <Paint>
                <Blur blur={BLUR} />
              </Paint>
            }
          >
            <Group origin={vec(GC, GC)} transform={spin}>
              <Circle c={vec(GC, GC)} r={GLOW_R}>
                <SweepGradient c={vec(GC, GC)} colors={RAINBOW} />
              </Circle>
            </Group>
          </Group>
        </Canvas>
        <View style={styles.iconDisc}>
          <Ionicons name="sparkles" size={34} color={Brand.ink} />
        </View>
      </View>

      <View style={styles.copy}>
        <BrandText weight="bold" color={Brand.ink} style={styles.headline}>
          Something Hidden Nearby
        </BrandText>
        <BrandText weight="semibold" color={Brand.inkSecondary} style={styles.distance}>
          {friendlyDistance(distanceM)}
        </BrandText>
        <View style={styles.cta}>
          <BrandText weight="bold" color={Brand.purple} style={styles.ctaText}>
            Tap to go find it
          </BrandText>
          <Ionicons name="arrow-forward" size={15} color={Brand.purple} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: BrandRadius.sticker,
    backgroundColor: Brand.surface,
    overflow: 'hidden',
  },
  // Fixed footprint that fits the 140px glow canvas centred behind the icon.
  badge: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowCanvas: {
    position: 'absolute',
    width: GLOW,
    height: GLOW,
  },
  iconDisc: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    ...stampBorder,
    borderRadius: BrandRadius.pill,
  },
  copy: {
    flex: 1,
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  headline: {
    fontSize: 19,
    lineHeight: 24,
  },
  distance: {
    fontSize: 14,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.two,
  },
  ctaText: {
    fontSize: 14,
  },
});
