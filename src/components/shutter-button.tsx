/**
 * ShutterButton — the camera capture button with a Skia-rendered glow.
 *
 *   'warm'  → a PINK button face (matches the "something nearby" pink) inside a
 *             large, slowly-spinning blurred RAINBOW glow halo — the same look as
 *             the home "hidden spot nearby" card (a hidden spot is near).
 *   'ready' → solid green face + green blurred glow (you're in range to check in).
 *   'none'  → a plain white shutter.
 *
 * Skia gives us the one thing plain RN can't: a true `blur` glow (the CSS
 * `filter: blur()` look) plus a smoothly rotating conic gradient.
 */
import React, { useEffect } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
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

import { Brand } from '@/constants/theme';

export type ShutterMode = 'none' | 'warm' | 'ready';

const SIZE = 144; // canvas — bigger than the button to give the big glow room
const C = SIZE / 2; // centre
const RING_R = 34; // white ring radius
const INNER_R = 30; // button face radius
const GLOW_R = 44; // glow radius — large halo; the 9px blur still fully fades
// INSIDE the canvas (otherwise the blur clips to the canvas edge → a square)
const BLUR = 9;
const GREEN = '#16a34a';
const PINK = Brand.sticker.pink; // matches the "something hidden nearby" pink

const RAINBOW = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff3b30'];

export function ShutterButton({ mode, onPress }: { mode: ShutterMode; onPress: () => void }) {
  const rot = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (mode === 'none') {
      rot.value = 0;
      pulse.value = 0;
      return;
    }
    rot.value = withRepeat(withTiming(Math.PI * 2, { duration: 6000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [mode, rot, pulse]);

  const spin = useDerivedValue(() => [{ rotate: rot.value }]);
  const glowOpacity = useDerivedValue(() => 0.45 + pulse.value * 0.25);
  const glowGrow = useDerivedValue(() => [{ scale: 1 + pulse.value * 0.05 }]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.touch}>
      {mode === 'none' ? (
        <View style={styles.plainRing}>
          <View style={styles.plainInner} />
        </View>
      ) : (
        <Canvas style={styles.canvas} pointerEvents="none">
          {/* Big blurred glow halo behind the button — spins slowly (warm). */}
          <Group
            origin={vec(C, C)}
            transform={glowGrow}
            opacity={glowOpacity}
            layer={
              <Paint>
                <Blur blur={BLUR} />
              </Paint>
            }
          >
            {mode === 'warm' ? (
              <Group origin={vec(C, C)} transform={spin}>
                <Circle c={vec(C, C)} r={GLOW_R}>
                  <SweepGradient c={vec(C, C)} colors={RAINBOW} />
                </Circle>
              </Group>
            ) : (
              <Circle c={vec(C, C)} r={GLOW_R} color={GREEN} />
            )}
          </Group>

          {/* Inner button face: pink when warm (matches the nearby pink), else green. */}
          <Circle c={vec(C, C)} r={INNER_R} color={mode === 'warm' ? PINK : GREEN} />

          {/* White ring. */}
          <Circle c={vec(C, C)} r={RING_R} color="#fff" style="stroke" strokeWidth={5} />
        </Canvas>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touch: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: SIZE,
    height: SIZE,
  },
  // Plain white shutter (no secret nearby): a ring with a solid centre.
  plainRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  plainInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
});
