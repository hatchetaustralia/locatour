/**
 * Skeleton — a lightweight placeholder block with a gentle brand-tinted pulse,
 * for loading states that mirror the real layout instead of a bare spinner.
 *
 * Pass width/height/radius to shape a single block, or compose several to mock
 * out a card. A single shared Animated.Value (per instance) drives a subtle
 * opacity pulse — cheap, native-driven, and easy on the eyes. The placeholder
 * tone is a soft neutral over the cream page so it reads as "content coming",
 * not "something's broken". See SkeletonGroup to share ONE pulse across a tree.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleProp, ViewStyle, DimensionValue } from 'react-native';

import { BrandRadius } from '@/constants/theme';

// Soft neutral placeholder tone over the cream page — warm enough to sit in the
// brand palette, muted enough to read as an inert placeholder.
const SKELETON_TONE = 'rgba(42,36,33,0.07)';

// A shared pulse so every block in a group breathes in sync (and we run ONE
// loop instead of one per block). Null outside a group → the block makes its own.
const PulseContext = createContext<Animated.Value | null>(null);

/** Drives a looping 0.45 → 1 → 0.45 opacity pulse on the given value. */
function usePulse(shared: Animated.Value | null): Animated.Value {
  const own = useRef(new Animated.Value(0.45)).current;
  const value = shared ?? own;

  useEffect(() => {
    // The group owns its loop (see SkeletonGroup); a lone block runs its own.
    if (shared) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shared, value]);

  return value;
}

/**
 * SkeletonGroup — share ONE pulse loop across many <Skeleton /> children so a
 * whole screen of placeholders breathes together (and runs a single animation).
 */
export function SkeletonGroup({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <PulseContext.Provider value={pulse}>{children}</PulseContext.Provider>;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = BrandRadius.control,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const shared = useContext(PulseContext);
  const opacity = usePulse(shared);

  const base = useMemo<ViewStyle>(
    () => ({ width, height, borderRadius: radius, backgroundColor: SKELETON_TONE }),
    [width, height, radius],
  );

  return <Animated.View style={[base, { opacity }, style]} />;
}
