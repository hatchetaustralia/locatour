/**
 * LevelUpBar — the celebratory "ding ding ding" XP bar for the check-in reveal.
 *
 * On a level-up it sweeps the fill 0→100% once per level gained (e.g. 12→16),
 * snapping empty + bumping the level badge + firing a success haptic at each
 * boundary, then settles at the real progress into the final level. On a normal
 * check-in (no level-up) it just sweeps once to the current progress.
 *
 * Visually matches the camera reveal's static level row (badge / track / badge).
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { BrandText } from '@/components/brand';
import { Brand, BrandRadius, Spacing } from '@/constants/theme';
import { MAX_LEVEL } from '@/utils/leveling';

const SEG_MS = 650; // sweep duration per level gained

export function LevelUpBar({
  fromLevel,
  toLevel,
  startFraction,
  endFraction,
}: {
  /** Level before the check-in (== toLevel when no level-up). */
  fromLevel: number;
  /** Level after the check-in. */
  toLevel: number;
  /** 0..1 fill the first sweep starts from. */
  startFraction: number;
  /** 0..1 fill the final sweep settles at (real progress into toLevel). */
  endFraction: number;
}) {
  const levels = Math.max(0, toLevel - fromLevel);
  const fill = useSharedValue(startFraction);
  const [displayLevel, setDisplayLevel] = useState(fromLevel);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (levels === 0) {
      // No level-up: a single sweep to the current progress.
      fill.value = withTiming(endFraction, { duration: SEG_MS, easing: Easing.out(Easing.cubic) });
      return;
    }
    // Multi-segment sweep: start→full, then (empty→full) per intermediate level,
    // then empty→endFraction for the final level. (withTiming returns the animated
    // value type — number — so the step list types as number[].)
    const steps: number[] = [withTiming(1, { duration: SEG_MS, easing: Easing.linear })];
    for (let i = 1; i < levels; i++) {
      steps.push(withTiming(0, { duration: 0 }));
      steps.push(withTiming(1, { duration: SEG_MS, easing: Easing.linear }));
    }
    steps.push(withTiming(0, { duration: 0 }));
    steps.push(withTiming(endFraction, { duration: SEG_MS, easing: Easing.out(Easing.cubic) }));
    fill.value = withSequence(...steps);

    // Bump the badge number + haptic "ding" + flash at each level boundary.
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= levels; i++) {
      timers.push(
        setTimeout(() => {
          setDisplayLevel(fromLevel + i);
          setFlash(true);
          setTimeout(() => setFlash(false), 220);
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            // haptics unavailable — ignore
          }
        }, i * SEG_MS)
      );
    }
    return () => timers.forEach(clearTimeout);
    // Runs once when the reveal mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, fill.value * 100))}%`,
  }));
  const maxed = displayLevel >= MAX_LEVEL;

  return (
    <View style={styles.row}>
      <View style={[styles.badge, styles.badgeCurrent, flash && styles.badgeFlash]}>
        <BrandText weight="bold" color={Brand.bg} style={styles.badgeText}>
          {displayLevel}
        </BrandText>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, barStyle]} />
      </View>
      <View style={[styles.badge, styles.badgeNext]}>
        <BrandText weight="bold" color={Brand.bg} style={maxed ? styles.maxText : styles.badgeText}>
          {maxed ? 'MAX' : displayLevel + 1}
        </BrandText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    width: '100%',
  },
  badge: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Brand.ink,
  },
  badgeCurrent: {
    backgroundColor: Brand.sticker.pink,
  },
  badgeNext: {
    backgroundColor: Brand.purple,
  },
  // A brief pop as a new level "dings" in.
  badgeFlash: {
    transform: [{ scale: 1.18 }],
    borderColor: Brand.sticker.gold,
    borderWidth: 2,
  },
  badgeText: {
    fontSize: 18,
  },
  maxText: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  track: {
    flex: 1,
    height: 16,
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.ink,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Brand.purple,
    borderRadius: BrandRadius.pill,
  },
});
