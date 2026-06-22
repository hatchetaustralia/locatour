/**
 * WeeklyStreakCard — the homepage hero card for a weekly exploration streak.
 *
 * Big flame-tinted number + "week streak" headline, then a row of week dots
 * (oldest -> newest) showing which recent weeks the explorer checked in. Active
 * weeks burn a warm flame colour; missed weeks sit as quiet outlines. A soft
 * gradient wash and a flame accent give it a bit of warmth without leaving the
 * cream passport look.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandText } from '@/components/brand';
import { Brand, BrandFonts, BrandRadius, Spacing, stampBorder } from '@/constants/theme';

// Warm flame palette for the active state and the accent glow.
const FLAME = '#F26A2E'; // primary flame orange
const FLAME_DEEP = '#E0481C'; // deeper ember for the number gradient base
const FLAME_SOFT = '#FBE3D4'; // pale wash behind the card

export function WeeklyStreakCard({
  streakWeeks,
  weeks,
}: {
  streakWeeks: number;
  weeks: { label: string; active: boolean }[];
}): React.JSX.Element {
  const hasStreak = streakWeeks > 0;
  const headline = !hasStreak
    ? 'Start a streak this week'
    : streakWeeks === 1
      ? '1 week streak'
      : `${streakWeeks} week streak`;

  const microcopy = hasStreak
    ? 'Check in this week to keep it going.'
    : 'One check-in and you are on your way.';

  return (
    <View style={[styles.card, stampBorder]}>
      {/* Soft flame wash sitting under the content. */}
      <LinearGradient
        colors={[FLAME_SOFT, Brand.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <View style={styles.flameBadge}>
          <BrandText style={styles.flameEmoji}>🔥</BrandText>
        </View>
        <View style={styles.headerText}>
          {hasStreak ? (
            <View style={styles.headlineRow}>
              <BrandText weight="bold" color={FLAME_DEEP} style={styles.bigNumber}>
                {streakWeeks}
              </BrandText>
              <BrandText weight="bold" color={Brand.ink} style={styles.weekStreakLabel}>
                week streak
              </BrandText>
            </View>
          ) : (
            <BrandText weight="bold" color={Brand.ink} style={styles.startHeadline}>
              {headline}
            </BrandText>
          )}
          <BrandText weight="medium" color={Brand.inkSecondary} style={styles.microcopy}>
            {microcopy}
          </BrandText>
        </View>
      </View>

      {/* Recent weeks, oldest -> newest. */}
      <View style={styles.weeksRow}>
        {weeks.map((week, i) => (
          <View key={`${week.label}-${i}`} style={styles.weekItem}>
            {week.active ? (
              <LinearGradient
                colors={[FLAME, FLAME_DEEP]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.dot, styles.dotActive]}
              >
                <BrandText style={styles.dotEmoji}>🔥</BrandText>
              </LinearGradient>
            ) : (
              <View style={[styles.dot, styles.dotInactive]} />
            )}
            <BrandText
              weight={week.active ? 'semibold' : 'medium'}
              color={week.active ? Brand.ink : Brand.inkSubtle}
              style={styles.weekLabel}
              numberOfLines={1}
            >
              {week.label}
            </BrandText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: BrandRadius.sticker,
    backgroundColor: Brand.surface,
    padding: Spacing.four,
    gap: Spacing.four,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flameBadge: {
    width: 52,
    height: 52,
    borderRadius: BrandRadius.pill,
    backgroundColor: FLAME_SOFT,
    borderWidth: 1,
    borderColor: FLAME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameEmoji: {
    fontSize: 26,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  bigNumber: {
    fontSize: 44,
    lineHeight: 48,
  },
  weekStreakLabel: {
    fontSize: 18,
  },
  startHeadline: {
    fontSize: 22,
    lineHeight: 28,
  },
  microcopy: {
    fontSize: 13,
    lineHeight: 18,
  },
  weeksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  weekItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 34,
    height: 34,
    borderRadius: BrandRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    borderWidth: 1,
    borderColor: FLAME_DEEP,
  },
  dotInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Brand.inkSubtle,
    borderStyle: 'dashed',
  },
  dotEmoji: {
    fontSize: 15,
  },
  weekLabel: {
    fontSize: 11,
    fontFamily: BrandFonts.medium,
  },
});
