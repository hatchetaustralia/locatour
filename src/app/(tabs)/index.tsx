import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAssets, BrandText } from '@/components/brand';
import { HiddenHeroCard } from '@/components/hidden-hero-card';
import { AchievementGrid } from '@/components/achievement-grid';
import { BlurredText } from '@/components/blurred-text';
import { LocationLoadingBar } from '@/components/location-loading-bar';
import { Brand, BrandRadius, Spacing, stampBorder } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { unlockedTier, rarityForTier } from '@/utils/leveling';
import { getConfig, tierRadiusBoost } from '@/utils/runtime-config';
import { refreshGeofencesOnFocus } from '@/utils/geofencing';
import { formatDistanceAway } from '@/utils/hidden-detection';
import { ExploreLocation } from '@/types';
import { useLocationContext } from '@/context/location-context';

// Straight-line distance (metres) between two coordinates — for the "nearest
// spots" fallback when there are no high-value top picks yet.
function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Shared location + located slice + hidden-spot-nearby readout (ONE watch/fetch
  // for the whole tab group — see LocationProvider). Home derives its card lists
  // from `reachable` and reads the live hidden-nearby readout from here, so it
  // no longer runs its own GPS watch or located fetch.
  const { user, activeCoords, reachable, hiddenWarm, hiddenDistanceM, hiddenInRange, nearestHidden } =
    useLocationContext();

  // Location ids the user has checked in at THIS calendar month — shown as
  // "done" in the monthly challenge list (which resets each month).
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  // The four achievements closest to unlocking, for the grid. Carries the extra
  // fields the tap-to-open detail modal needs (what to do + exact progress).
  const [nextAch, setNextAch] = useState<
    {
      title: string;
      iconName: string;
      progress: number;
      difficulty?: string;
      description?: string;
      points?: number;
      metric?: string;
      threshold?: number;
      value?: number;
    }[]
  >([]);
  // A locked card the user tapped — drives the "not quite ready" popup.
  const [lockedInfo, setLockedInfo] = useState<ExploreLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Dashboard-only data loader. Location + the located slice + hidden detection
  // now come from the shared LocationProvider; Home only loads its own this-month
  // completed-challenge set and the achievements grid. (Weekly popularity counts
  // ride along on each location from the API — see ExploreLocation.checkinsThisWeek.)
  useEffect(() => {
    async function loadData() {
      try {
        const currentUser = await storage.getUser();
        if (!currentUser) {
          // No profile yet → start the up-front story walkthrough, which then
          // leads into account creation.
          router.replace('/auth/walkthrough');
          return;
        }
        const checkIns = await storage.getCheckIns();
        // Mark challenges completed this month (the list resets monthly).
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
        setCompletedIds(
          new Set(
            checkIns
              .filter((c) => new Date(c.timestamp).getTime() >= monthStart)
              .map((c) => c.locationId)
          )
        );
        // The four achievements closest to unlocking, for the grid.
        setNextAch(await storage.getNextAchievements(4));
      } catch (e) {
        console.error('Failed to load home dashboard data', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Keep background geofences in sync with the user's progress: prompts for
  // permission once (existing users who skipped the walkthrough), then re-arms
  // the never-visited spots each time Home regains focus — e.g. after a check-in
  // drops a spot from the monitored set (spec 08, Phase 2).
  useFocusEffect(
    useCallback(() => {
      void refreshGeofencesOnFocus();
    }, [])
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Brand.sticker.pink} />
      </View>
    );
  }

  if (!user) return null;

  const unlocked = unlockedTier(user.stats.currentLevel);
  // Server-tunable radii/ranges, read at render time so admin edits apply live.
  const cfg = getConfig();
  // The tier-filtered slice that drives the card lists, derived from the shared
  // provider `reachable` (unfiltered): unlocked spots + the +1/+2 locked teasers
  // (and majors). The +3 hidden band stays out of the visible lists — the hidden
  // readout (activeCoords/hiddenWarm/hiddenDistanceM) comes from the provider.
  const cap = unlocked + cfg.lockTeaserRange;
  const locations = reachable.filter((loc) => loc.isMajorDestination || loc.tier <= cap);
  // Per-card helpers. A spot is LOCKED if it's above the player's tier (surfaced
  // +1/+2 teasers + any above-tier major) — hard-locked, level up to reach it.
  // "Worth the trip" = a real trip beyond the 10km local bubble.
  const isLocked = (loc: ExploreLocation) => loc.tier > unlocked;
  const isWorthTrip = (loc: ExploreLocation) =>
    !!activeCoords &&
    !loc.isMajorDestination &&
    distanceMeters(activeCoords, loc.coordinates) > cfg.vicinityRadiusM * tierRadiusBoost(user.stats.currentLevel);

  // The home lists work at the 200km REACH range (the map stays a tight local
  // bubble — that's separate): your local spots PLUS a taste of what's further
  // afield, so an Exmouth player can see what Perth is chasing.
  const reachLocations = locations.filter(
    (loc) =>
      loc.isMajorDestination ||
      !activeCoords ||
      distanceMeters(activeCoords, loc.coordinates) <= cfg.reachRadiusM
  );

  // Split reachable spots into what you can VISIT NOW (accessible at your tier)
  // vs aspirational LOCKED teasers (surfaced +1/+2 spots that need a level-up).
  // The lists are built accessible-FIRST with a hard cap on locked teasers, so a
  // new low-level player sees mostly things they can actually go and do — not a
  // wall of locks (the old `points >= 300` top-pick rule only ever matched
  // Tier 3+, which are all locked for a beginner).
  const byDistance = (a: ExploreLocation, b: ExploreLocation) =>
    activeCoords
      ? distanceMeters(activeCoords, a.coordinates) - distanceMeters(activeCoords, b.coordinates)
      : 0;
  const byValue = (a: ExploreLocation, b: ExploreLocation) => b.points - a.points;
  const byNearestThenValue = (a: ExploreLocation, b: ExploreLocation) => byDistance(a, b) || byValue(a, b);
  const byValueThenNearest = (a: ExploreLocation, b: ExploreLocation) => byValue(a, b) || byDistance(a, b);

  const accessible = reachLocations.filter((loc) => !isLocked(loc));
  const lockedTeasers = reachLocations.filter((loc) => isLocked(loc));

  // Top picks: the best spots you can visit now (most rewarding, then nearest)
  // plus AT MOST one aspirational locked teaser — never a wall of locks (~5).
  const topPicks = [
    ...[...accessible].sort(byValueThenNearest).slice(0, 4),
    ...[...lockedTeasers].sort(byValueThenNearest).slice(0, 1),
  ];
  const topPickIds = new Set(topPicks.map((l) => l.id));

  // This month's challenges: nearest accessible spots, plus AT MOST three locked
  // teasers to aspire to; completed (this month) sink to the bottom. The stable
  // sort preserves the accessible-before-locked ordering otherwise.
  const sortedChallenges = [
    ...accessible.filter((loc) => !topPickIds.has(loc.id)).sort(byNearestThenValue).slice(0, 9),
    ...lockedTeasers.filter((loc) => !topPickIds.has(loc.id)).sort(byValueThenNearest).slice(0, 3),
  ].sort((a, b) => Number(completedIds.has(a.id)) - Number(completedIds.has(b.id)));
  const now = new Date();
  const daysToReset = Math.max(
    1,
    Math.ceil(
      (new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - now.getTime()) / 86400000
    )
  );

  const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    switch (category) {
      case 'parks': return 'leaf-outline';
      case 'scenic': return 'camera-outline';
      default: return 'compass-outline';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'parks': return Brand.sticker.green;
      case 'scenic': return Brand.sticker.pink;
      default: return Brand.sticker.purple;
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* App header: logo wordmark (profile + map live in the bottom nav). */}
        <View style={styles.header}>
          <Image source={BrandAssets.logo} style={styles.logo} resizeMode="contain" />
        </View>

        {/* Transient "pulling nearby spots" indicator while GPS / locations load. */}
        <LocationLoadingBar topOffset={50} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Spacing.two, paddingBottom: insets.bottom + 72 },
          ]}
        >
          {/* ── Hidden hero (only when a hidden spot is warm-close) ── */}
          {(hiddenWarm || hiddenInRange) && (
            <View style={styles.heroSection}>
              <HiddenHeroCard
                distanceM={hiddenDistanceM ?? 0}
                // Reached it (≤ HIDDEN_RADIUS) → reveal the spot + "check in"; else
                // keep teasing "hidden spot nearby". Routes to the camera to claim
                // it once found, the map to go hunt it otherwise.
                discovered={
                  hiddenInRange && nearestHidden
                    ? { name: nearestHidden.spot.name, image: nearestHidden.spot.imageUrls?.[0] ?? null }
                    : null
                }
                onPress={() => router.push(hiddenInRange ? '/camera' : '/explore')}
              />
            </View>
          )}

          {/* ── Achievements: the stamps you're closing in on (top of the feed,
              just under the hidden hero) ── */}
          <View style={styles.section}>
            <View style={[styles.sectionTitleRow, { marginBottom: Spacing.three }]}>
              <Ionicons name="ribbon-outline" size={18} color={Brand.ink} />
              <BrandText weight="semibold" style={styles.sectionTitle}>
                Closing in on
              </BrandText>
            </View>
            <AchievementGrid items={nextAch} />
          </View>

          {/* ── This month's challenges ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="flag-outline" size={18} color={Brand.ink} />
                <BrandText weight="semibold" style={styles.sectionTitle}>
                  This month&apos;s challenges
                </BrandText>
              </View>
              <View style={styles.resetPill}>
                <Ionicons name="time-outline" size={12} color={Brand.inkSecondary} />
                <BrandText weight="semibold" style={styles.resetText}>
                  Resets in {daysToReset}d
                </BrandText>
              </View>
            </View>

            <View style={[styles.verticalList, { marginTop: Spacing.three }]}>
              {sortedChallenges.map(item => {
                const done = completedIds.has(item.id);
                const locked = isLocked(item);
                const worthTrip = isWorthTrip(item);
                return (
                <TouchableOpacity
                  key={item.id}
                  // Locked spots are NOT dimmed — keep the photo crystal clear so an
                  // explorer can recognise the place; only the NAME/ADDRESS are
                  // blurred (below) to keep it a mystery worth chasing.
                  style={[styles.challengeCard, done && styles.challengeCardDim]}
                  activeOpacity={0.85}
                  onPress={() =>
                    locked
                      ? setLockedInfo(item)
                      : router.push({ pathname: '/explore', params: { selectedId: item.id } })
                  }
                >
                  <Image source={{ uri: item.imageUrls[0] }} style={styles.challengeImage} />
                  <View style={styles.challengeInfo}>
                    {worthTrip && (
                      <View style={styles.worthTripTag}>
                        <Ionicons name="airplane" size={9} color={Brand.purple} />
                        <BrandText weight="bold" style={styles.reachBadgeText}>
                          Worth the trip
                        </BrandText>
                      </View>
                    )}
                    {locked ? (
                      <BlurredText fontSize={14} weight="600" color={Brand.ink} maxWidth={200}>
                        {item.name}
                      </BlurredText>
                    ) : (
                      <BrandText weight="semibold" style={styles.challengeName} numberOfLines={1}>
                        {item.name}
                      </BrandText>
                    )}
                    <View style={styles.pickAddressRow}>
                      <Ionicons name="location-outline" size={12} color={Brand.inkSecondary} />
                      {locked ? (
                        <BlurredText fontSize={12} weight="500" color={Brand.inkSecondary} maxWidth={170}>
                          {item.address}
                        </BlurredText>
                      ) : (
                        <BrandText weight="medium" style={styles.pickAddress} numberOfLines={1}>
                          {item.address}
                        </BrandText>
                      )}
                    </View>
                    <View style={styles.challengeMeta}>
                      {/* Category chip */}
                      <View
                        style={[
                          styles.categoryChip,
                          { backgroundColor: getCategoryColor(item.category) + '28' },
                        ]}
                      >
                        <Ionicons
                          name={getCategoryIcon(item.category)}
                          size={10}
                          color={getCategoryColor(item.category)}
                        />
                        <BrandText
                          weight="semibold"
                          style={[styles.categoryChipText, { color: getCategoryColor(item.category) }]}
                        >
                          {item.category.toUpperCase()}
                        </BrandText>
                      </View>
                      <View style={styles.tierBadge}>
                        <BrandText weight="bold" style={styles.tierBadgeText}>{rarityForTier(item.tier)}</BrandText>
                      </View>
                      {activeCoords && (
                        <View style={styles.distanceChip}>
                          <Ionicons name="navigate-outline" size={10} color={Brand.inkSecondary} />
                          <BrandText weight="semibold" style={styles.distanceChipText}>
                            {formatDistanceAway(distanceMeters(activeCoords, item.coordinates))}
                          </BrandText>
                        </View>
                      )}
                    </View>
                  </View>
                  {locked ? (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={16} color={Brand.inkSubtle} />
                    </View>
                  ) : done ? (
                    <View style={styles.doneBadge}>
                      <Ionicons name="checkmark-circle" size={18} color={Brand.sticker.green} />
                      <BrandText weight="bold" style={styles.doneBadgeText}>Done</BrandText>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={Brand.inkSubtle} />
                  )}
                </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── This week's top picks (below challenges) ── */}
          <View style={styles.section}>
            <View style={[styles.sectionTitleRow, { marginBottom: Spacing.three }]}>
              <Ionicons name="medal-outline" size={18} color={Brand.ink} />
              <BrandText weight="semibold" style={styles.sectionTitle}>
                This weeks top picks
              </BrandText>
            </View>

            {/* Vertical list of top-pick cards */}
            <View style={styles.verticalList}>
              {topPicks.map(item => {
                const locked = isLocked(item);
                // Community popularity this week (everyone's check-ins), from the
                // locations API — social proof for why it's a top pick.
                const popular = item.checkinsThisWeek ?? 0;
                return (
                <TouchableOpacity
                  key={item.id}
                  // Same card as the monthly challenges (image clear, name/address
                  // blurred when locked) with a weekly popularity tag on top.
                  style={styles.challengeCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    locked
                      ? setLockedInfo(item)
                      : router.push({ pathname: '/explore', params: { selectedId: item.id } })
                  }
                >
                  <Image source={{ uri: item.imageUrls[0] }} style={styles.challengeImage} />
                  <View style={styles.challengeInfo}>
                    {popular > 0 && (
                      <View style={styles.weekCountTag}>
                        <Ionicons name="footsteps" size={9} color={Brand.teal} />
                        <BrandText weight="bold" style={styles.weekCountTagText}>
                          {popular} check-in{popular === 1 ? '' : 's'} this week
                        </BrandText>
                      </View>
                    )}
                    {locked ? (
                      <BlurredText fontSize={14} weight="600" color={Brand.ink} maxWidth={200}>
                        {item.name}
                      </BlurredText>
                    ) : (
                      <BrandText weight="semibold" style={styles.challengeName} numberOfLines={1}>
                        {item.name}
                      </BrandText>
                    )}
                    <View style={styles.pickAddressRow}>
                      <Ionicons name="location-outline" size={12} color={Brand.inkSecondary} />
                      {locked ? (
                        <BlurredText fontSize={12} weight="500" color={Brand.inkSecondary} maxWidth={170}>
                          {item.address}
                        </BlurredText>
                      ) : (
                        <BrandText weight="medium" style={styles.pickAddress} numberOfLines={1}>
                          {item.address}
                        </BrandText>
                      )}
                    </View>
                    <View style={styles.challengeMeta}>
                      <View
                        style={[
                          styles.categoryChip,
                          { backgroundColor: getCategoryColor(item.category) + '28' },
                        ]}
                      >
                        <Ionicons
                          name={getCategoryIcon(item.category)}
                          size={10}
                          color={getCategoryColor(item.category)}
                        />
                        <BrandText
                          weight="semibold"
                          style={[styles.categoryChipText, { color: getCategoryColor(item.category) }]}
                        >
                          {item.category.toUpperCase()}
                        </BrandText>
                      </View>
                      <View style={styles.tierBadge}>
                        <BrandText weight="bold" style={styles.tierBadgeText}>{rarityForTier(item.tier)}</BrandText>
                      </View>
                      {activeCoords && (
                        <View style={styles.distanceChip}>
                          <Ionicons name="navigate-outline" size={10} color={Brand.inkSecondary} />
                          <BrandText weight="semibold" style={styles.distanceChipText}>
                            {formatDistanceAway(distanceMeters(activeCoords, item.coordinates))}
                          </BrandText>
                        </View>
                      )}
                    </View>
                  </View>
                  {locked ? (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={16} color={Brand.inkSubtle} />
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={Brand.inkSubtle} />
                  )}
                </TouchableOpacity>
                );
              })}
            </View>
          </View>

        </ScrollView>

        {/* Locked-spot nudge — no level/tier numbers, just encouragement. */}
        <Modal
          visible={lockedInfo !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setLockedInfo(null)}
        >
          <View style={styles.confirmOverlay}>
            <View style={[styles.confirmCard, stampBorder]}>
              <BrandText weight="semibold" style={styles.confirmTitle}>
                Not quite ready
              </BrandText>
              <BrandText weight="medium" color={Brand.inkSecondary} style={styles.confirmBody}>
                {lockedInfo?.name} is still locked. Keep getting out there and checking in, and as
                you level up spots like this open for you to discover.
              </BrandText>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmKeep, stampBorder]}
                activeOpacity={0.85}
                onPress={() => setLockedInfo(null)}
              >
                <BrandText weight="bold" color="#FFFFFF" style={styles.confirmButtonText}>
                  Keep exploring
                </BrandText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  logo: {
    width: 130,
    height: 28,
  },

  // ── Scroll content ───────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: 96, // clear tab bar
  },

  // ── Sections ─────────────────────────────────────────────────────────────────
  section: {
    marginBottom: Spacing.four,
  },
  heroSection: {
    marginBottom: Spacing.four,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  sectionTitle: {
    fontSize: 16,
    color: Brand.ink,
  },
  viewAllLink: {
    fontSize: 13,
    color: Brand.purple,
  },

  // ── Vertical list ────────────────────────────────────────────────────────────
  verticalList: {
    gap: Spacing.two,
  },

  // ── Top-pick card ─────────────────────────────────────────────────────────────
  pickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.surface,
    padding: Spacing.two + 4,
    gap: Spacing.three,
    ...stampBorder,
    borderRadius: BrandRadius.sticker,
  },
  pickImage: {
    width: 72,
    height: 72,
    borderRadius: BrandRadius.sticker - 2,
    backgroundColor: Brand.bg,
  },
  pickInfo: {
    flex: 1,
    gap: 4,
  },
  pickName: {
    fontSize: 15,
    color: Brand.ink,
  },
  pickAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pickAddress: {
    flex: 1,
    fontSize: 12,
    color: Brand.inkSecondary,
    lineHeight: 16,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: BrandRadius.pill,
  },
  pointsText: {
    fontSize: 12,
    color: '#d97706',
  },

  // ── "VIEW THEM ALL" pink button ──────────────────────────────────────────────
  viewAllButton: {
    marginTop: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    backgroundColor: Brand.sticker.pink,
    ...stampBorder,
    borderRadius: BrandRadius.sticker,
  },
  viewAllButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // ── Challenge card ───────────────────────────────────────────────────────────
  challengeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.surface,
    padding: Spacing.two + 4,
    gap: Spacing.three,
    ...stampBorder,
    borderRadius: BrandRadius.sticker,
  },
  challengeImage: {
    width: 64,
    height: 64,
    borderRadius: BrandRadius.sticker - 2,
    backgroundColor: Brand.bg,
  },
  challengeInfo: {
    flex: 1,
    gap: 4,
  },
  challengeName: {
    fontSize: 14,
    color: Brand.ink,
  },
  challengeMeta: {
    // No wrap: keep category · tier · distance on ONE inline row (the distance
    // chip used to wrap to its own line, which read as a wasted extra row).
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
  },
  categoryChipText: {
    fontSize: 9,
  },
  distanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(42,36,33,0.06)',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
  },
  distanceChipText: {
    fontSize: 9,
    color: Brand.inkSecondary,
  },
  reachBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(129,65,220,0.10)',
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
  },
  reachBadgeText: {
    fontSize: 9,
    color: Brand.purple,
  },
  // Standalone "Worth the trip" tag shown ABOVE the challenge title so it stands
  // out instead of overflowing the inline meta row.
  worthTripTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    backgroundColor: 'rgba(129,65,220,0.10)',
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
    marginBottom: 4,
  },
  // "N check-ins this week" tag above top-pick titles.
  weekCountTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    backgroundColor: 'rgba(125,227,231,0.18)',
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
    marginBottom: 4,
  },
  weekCountTagText: {
    fontSize: 9,
    color: Brand.teal,
  },
  // Locked spots keep the photo crystal clear, but the name + address render as a
  // genuinely blurred placeholder via <BlurredText /> (Skia Gaussian blur over a
  // scrambled string) so the place stays a mystery — see components/blurred-text.
  resetPill: {
    ...stampBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Brand.surface,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: BrandRadius.pill,
  },
  resetText: {
    fontSize: 11,
    // Match line height to font size + drop Android's extra font padding so the
    // "Resets in Nd" text sits vertically centred against the clock icon.
    lineHeight: 13,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: Brand.inkSecondary,
  },
  challengeCardDim: {
    opacity: 0.55,
  },
  doneBadge: {
    alignItems: 'center',
    gap: 1,
  },
  doneBadgeText: {
    fontSize: 9,
    color: Brand.sticker.green,
  },
  pickBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  tierBadge: {
    backgroundColor: 'rgba(42,36,33,0.06)',
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
  },
  tierBadgeText: {
    fontSize: 9,
    color: Brand.inkSecondary,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },

  // ── Locked-spot nudge modal (matches profile's confirm modal language) ───────
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Brand.surface,
    borderRadius: BrandRadius.sticker,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  confirmTitle: {
    fontSize: 18,
    color: Brand.ink,
  },
  confirmBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  confirmButton: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BrandRadius.control,
  },
  confirmKeep: {
    marginTop: Spacing.three,
    backgroundColor: Brand.sticker.pink,
  },
  confirmButtonText: {
    fontSize: 15,
  },
});
