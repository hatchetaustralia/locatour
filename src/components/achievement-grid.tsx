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
 * Tapping a stamp opens a detail modal that explains WHAT to do to earn it and
 * shows exact progress ("2 / 3 check-ins in one day"). The richer fields
 * (description/metric/threshold/value/points) are optional so the grid still
 * renders from the primitive contract if they're absent.
 */
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Modal, TouchableOpacity } from 'react-native';
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
  /** What the explorer must do to earn it (e.g. "Log 3 check-ins in one day."). */
  description?: string;
  /** Prestige score shown on the badge (achievements don't grant XP). */
  points?: number;
  /** Machine metric + target + current value, for the exact "2 / 3" progress line. */
  metric?: string;
  threshold?: number;
  value?: number;
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

// Human nouns for each machine metric, so the modal's progress line reads
// naturally ("2 / 3 check-ins in one day" rather than "checkins_in_day").
const METRIC_LABEL: Record<string, string> = {
  total_checkins: 'check-ins',
  unique_locations: 'unique locations',
  day_streak: 'day streak',
  total_xp: 'XP',
  level: 'level',
  tier_reached: 'highest tier reached',
  distinct_categories: 'categories visited',
  checkins_in_day: 'check-ins in one day',
  category_checkins_parks: 'park check-ins',
  category_checkins_scenic: 'scenic check-ins',
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function accentFor(item: AchievementItem): string {
  return (item.difficulty && DIFFICULTY_COLOR[item.difficulty]) || Brand.teal;
}

export function AchievementGrid({ items }: { items: AchievementItem[] }): React.JSX.Element {
  // Forward-looking: surface the four closest-to-unlocked stamps.
  const next = items.slice(0, 4);
  const [selected, setSelected] = useState<AchievementItem | null>(null);

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
    <>
      <View style={styles.grid}>
        {next.map((item, i) => {
          const pct = clamp01(item.progress);
          const pctLabel = `${Math.round(pct * 100)}%`;
          const accent = accentFor(item);

          return (
            <Pressable
              key={`${item.title}-${i}`}
              style={({ pressed }) => [styles.cell, stampBorder, pressed && styles.cellPressed]}
              onPress={() => setSelected(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${pctLabel} complete. Tap for how to earn it.`}
            >
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
            </Pressable>
          );
        })}
      </View>

      <AchievementDetailModal item={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/** Tap-to-open detail: badge, what-to-do, exact progress, and prestige points. */
function AchievementDetailModal({
  item,
  onClose,
}: {
  item: AchievementItem | null;
  onClose: () => void;
}): React.JSX.Element {
  const accent = item ? accentFor(item) : Brand.teal;
  const pct = item ? clamp01(item.progress) : 0;
  const hasCount = !!item && item.threshold != null && item.value != null;
  const metricLabel = (item?.metric && METRIC_LABEL[item.metric]) || '';

  return (
    <Modal
      visible={item !== null}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        {/* Stop taps on the card from dismissing. */}
        <TouchableOpacity activeOpacity={1} style={[styles.modalCard, stampBorder]} onPress={() => {}}>
          {item ? (
            <>
              <View style={[styles.modalIconWell, { borderColor: accent }]}>
                <Ionicons
                  name={item.iconName as keyof typeof Ionicons.glyphMap}
                  size={34}
                  color={accent}
                />
              </View>

              <BrandText weight="bold" style={styles.modalTitle}>
                {item.title}
              </BrandText>

              {item.difficulty ? (
                <View style={[styles.modalDifficultyChip, { backgroundColor: accent }]}>
                  <BrandText weight="bold" color={Brand.surface} style={styles.difficultyChipText}>
                    {item.difficulty}
                  </BrandText>
                </View>
              ) : null}

              {item.description ? (
                <View style={styles.modalSection}>
                  <BrandText weight="bold" color={Brand.inkSecondary} style={styles.modalLabel}>
                    HOW TO EARN
                  </BrandText>
                  <BrandText weight="medium" style={styles.modalBody}>
                    {item.description}
                  </BrandText>
                </View>
              ) : null}

              <View style={styles.modalSection}>
                <BrandText weight="bold" color={Brand.inkSecondary} style={styles.modalLabel}>
                  YOUR PROGRESS
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
                    {`${Math.round(pct * 100)}%`}
                  </BrandText>
                </View>
                {hasCount ? (
                  <BrandText weight="semibold" color={Brand.inkSecondary} style={styles.modalCount}>
                    {`${item.value} / ${item.threshold}${metricLabel ? ` ${metricLabel}` : ''}`}
                  </BrandText>
                ) : null}
              </View>

              {item.points != null ? (
                <View style={styles.modalReward}>
                  <Ionicons name="trophy" size={15} color={Brand.sticker.gold} />
                  <BrandText weight="bold" color={Brand.ink} style={styles.modalRewardText}>
                    {`+${item.points} points`}
                  </BrandText>
                </View>
              ) : null}

              <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.85}>
                <BrandText weight="bold" color={Brand.surface} style={styles.modalCloseText}>
                  Got it
                </BrandText>
              </TouchableOpacity>
            </>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
  cellPressed: {
    opacity: 0.7,
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
  // Detail modal.
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Brand.surface,
    borderRadius: BrandRadius.sticker,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  modalIconWell: {
    width: 64,
    height: 64,
    borderRadius: BrandRadius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.bg,
  },
  modalTitle: {
    fontSize: 18,
    color: Brand.ink,
    textAlign: 'center',
  },
  modalDifficultyChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
  },
  modalSection: {
    width: '100%',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  modalLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Brand.ink,
  },
  modalCount: {
    fontSize: 12,
    marginTop: 2,
  },
  // Gamified reward badge — gold "+N points" pill.
  modalReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.two,
    backgroundColor: 'rgba(245,166,35,0.16)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: BrandRadius.pill,
  },
  modalRewardText: {
    fontSize: 13,
  },
  modalClose: {
    marginTop: Spacing.three,
    alignSelf: 'stretch',
    backgroundColor: Brand.ink,
    borderRadius: BrandRadius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 15,
  },
});
