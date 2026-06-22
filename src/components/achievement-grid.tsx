/**
 * AchievementGrid — a 2x2 wall of the explorer's NEXT achievable stamps.
 *
 * This is the forward-looking sibling of the full Achievements list on the
 * profile screen: instead of celebrating what's already unlocked, it nudges the
 * explorer toward what's almost in reach. Each cell shows the badge icon, the
 * title, a slim gradient progress bar with a "62%" readout, and an optional
 * difficulty chip. The card styling matches the brand "passport / ticket-stub"
 * language used across the app (cream surface, stamp border, rounded corners,
 * Poppins via BrandText).
 *
 * Purely presentational: it renders only the primitive props in its contract.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandText } from '@/components/brand';
import { Brand, BrandRadius, Spacing, stampBorder } from '@/constants/theme';

type AchievementItem = {
  title: string;
  iconName: string;
  /** 0..1 forward progress toward unlocking. */
  progress: number;
  difficulty?: string;
};

// Same difficulty palette the profile screen uses, so chips read consistently.
const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: '#16a34a',
  Medium: '#0ea5e9',
  Hard: '#f59e0b',
  Elite: '#ef4444',
  Master: '#9333ea',
  Grandmaster: '#db2777',
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function AchievementGrid({ items }: { items: AchievementItem[] }): React.JSX.Element {
  // Forward-looking: surface the four closest-to-unlocked stamps.
  const next = items.slice(0, 4);

  if (next.length === 0) {
    return (
      <View style={[styles.empty, stampBorder]}>
        <Ionicons name="trail-sign" size={28} color={Brand.teal} style={styles.emptyIcon} />
        <BrandText weight="bold" style={styles.emptyTitle}>
          You&apos;re all caught up
        </BrandText>
        <BrandText weight="medium" color={Brand.inkSecondary} style={styles.emptyBody}>
          Head out and check in somewhere new to line up your next stamp.
        </BrandText>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {next.map((item, i) => {
        const pct = clamp01(item.progress);
        const pctLabel = `${Math.round(pct * 100)}%`;
        const accent = (item.difficulty && DIFFICULTY_COLOR[item.difficulty]) || Brand.teal;

        return (
          <View key={`${item.title}-${i}`} style={[styles.cell, stampBorder]}>
            <View style={styles.cellTop}>
              <View style={[styles.iconWell, { borderColor: accent }]}>
                <Ionicons
                  name={item.iconName as keyof typeof Ionicons.glyphMap}
                  size={22}
                  color={accent}
                />
              </View>
              {item.difficulty ? (
                <View style={[styles.difficultyChip, { backgroundColor: accent }]}>
                  <BrandText weight="bold" color={Brand.surface} style={styles.difficultyChipText}>
                    {item.difficulty}
                  </BrandText>
                </View>
              ) : null}
            </View>

            <BrandText weight="semibold" style={styles.title} numberOfLines={2}>
              {item.title}
            </BrandText>

            <View style={styles.progressRow}>
              <View style={styles.track}>
                <LinearGradient
                  colors={[accent, Brand.teal]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.fill, { width: `${pct * 100}%` }]}
                />
              </View>
              <BrandText weight="bold" color={Brand.ink} style={styles.pctLabel}>
                {pctLabel}
              </BrandText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // Two columns: each cell is just under half so the row gap fits between them.
  cell: {
    width: '48.5%',
    padding: Spacing.three,
    gap: Spacing.two,
    backgroundColor: Brand.surface,
    borderRadius: BrandRadius.sticker,
  },
  cellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: BrandRadius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.bg,
  },
  difficultyChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BrandRadius.pill,
  },
  difficultyChipText: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
    color: Brand.ink,
    minHeight: 34, // reserve two lines so single/double-line titles align across the row
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  track: {
    flex: 1,
    height: 7,
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.bg,
    borderWidth: 1,
    borderColor: Brand.inkSubtle,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: BrandRadius.pill,
  },
  pctLabel: {
    fontSize: 11,
    minWidth: 30,
    textAlign: 'right',
  },
  // Empty state — a single encouraging card in the same brand language.
  empty: {
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.surface,
    borderRadius: BrandRadius.sticker,
  },
  emptyIcon: {
    marginBottom: Spacing.one,
  },
  emptyTitle: {
    fontSize: 15,
    color: Brand.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
