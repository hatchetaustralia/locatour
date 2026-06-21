import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { BrandAssets, BrandText } from '@/components/brand';
import { Brand, BrandRadius, Spacing, stampBorder } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { unlockedTier, levelForTier, VICINITY_RADIUS_M, REACH_RADIUS_M, LOCK_TEASER_RANGE } from '@/utils/leveling';
import { refreshGeofencesOnFocus } from '@/utils/geofencing';
import { User, ExploreLocation } from '@/types';

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

  const [user, setUser] = useState<User | null>(null);
  const [locations, setLocations] = useState<ExploreLocation[]>([]);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  // Location ids the user has checked in at THIS calendar month — shown as
  // "done" in the monthly challenge list (which resets each month).
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Authentication check and data loader
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
        setUser(currentUser);
        // Surface unlocked spots + the +1/+2 locked teasers (and majors). The
        // +3 hidden band is never shown here (it's discover-only). Instant load
        // from cache/bundle; the located fetch below re-syncs the real slice.
        const allLocs = await storage.getLocations();
        const cap = unlockedTier(currentUser.stats.currentLevel) + LOCK_TEASER_RANGE;
        setLocations(allLocs.filter((loc) => loc.isMajorDestination || loc.tier <= cap));

        // Mark challenges completed this month (the list resets monthly).
        const checkIns = await storage.getCheckIns();
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
        setCompletedIds(
          new Set(
            checkIns
              .filter((c) => new Date(c.timestamp).getTime() >= monthStart)
              .map((c) => c.locationId)
          )
        );
      } catch (e) {
        console.error('Failed to load user or locations in Home', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();

    // Best-effort current location for the "nearest spots" fallback. Runs
    // SEPARATELY (fire-and-forget) so a slow or never-arriving GPS fix can never
    // block the dashboard from rendering — it just updates the ordering once it
    // resolves. (getCurrentPositionAsync can hang indefinitely without a fix.)
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserCoords(coords);
        // Re-sync the real local slice now that we know where they are + their
        // level — the server returns only their tier-relevant reach spots (+
        // majors), so we never pull the whole catalogue. This is the "new city"
        // / reopen sync trigger.
        const u = await storage.getUser();
        const level = u?.stats.currentLevel ?? 1;
        const slice = await storage.getLocations({ ...coords, level });
        const cap = unlockedTier(level) + LOCK_TEASER_RANGE;
        setLocations(slice.filter((l) => l.isMajorDestination || l.tier <= cap));
      } catch {
        // ignore — keep the instant cached/bundled set
      }
    })();
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
  // Per-card helpers. A spot is LOCKED if it's above the player's tier (surfaced
  // +1/+2 teasers + any above-tier major) — hard-locked, level up to reach it.
  // "Worth the trip" = a real trip beyond the 10km local bubble.
  const isLocked = (loc: ExploreLocation) => loc.tier > unlocked;
  const isWorthTrip = (loc: ExploreLocation) =>
    !!userCoords &&
    !loc.isMajorDestination &&
    distanceMeters(userCoords, loc.coordinates) > VICINITY_RADIUS_M;

  // The home lists work at the 200km REACH range (the map stays a tight local
  // bubble — that's separate): your local spots PLUS a taste of what's further
  // afield, so an Exmouth player can see what Perth is chasing.
  const reachLocations = locations.filter(
    (loc) =>
      loc.isMajorDestination ||
      !userCoords ||
      distanceMeters(userCoords, loc.coordinates) <= REACH_RADIUS_M
  );

  // Top picks = high-value spots within reach (incl. aspirational locked ones);
  // nearest-few fallback so the section is never empty. Curated, not a flood.
  const highValue = reachLocations.filter((loc) => loc.points >= 300);
  const byDistance = (a: ExploreLocation, b: ExploreLocation) =>
    userCoords
      ? distanceMeters(userCoords, a.coordinates) - distanceMeters(userCoords, b.coordinates)
      : 0;
  const topPicks = (highValue.length > 0 ? [...highValue].sort(byDistance) : [...reachLocations].sort(byDistance)).slice(0, 6);
  const topPickIds = new Set(topPicks.map((l) => l.id));

  // This month's challenges = the rest within reach; completed (this month) sink
  // to the bottom in a done state. Curated to a realistic monthly count.
  const sortedChallenges = reachLocations
    .filter((loc) => !topPickIds.has(loc.id))
    .sort(
      (a, b) =>
        Number(completedIds.has(a.id)) - Number(completedIds.has(b.id)) || byDistance(a, b)
    )
    .slice(0, 12);
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
      case 'food': return 'restaurant-outline';
      default: return 'compass-outline';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'parks': return Brand.sticker.green;
      case 'scenic': return Brand.sticker.pink;
      case 'food': return Brand.sticker.gold;
      default: return Brand.sticker.purple;
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* App header: logo wordmark + streak chip + settings gear */}
        <View style={styles.header}>
          <Image source={BrandAssets.logo} style={styles.logo} resizeMode="contain" />
          <View style={styles.headerRight}>
            {/* Streak chip (profile + map live in the bottom nav, not here) */}
            <View style={styles.streakChip}>
              <Ionicons name="flame" size={14} color="#ef4444" />
              <BrandText weight="semibold" style={styles.streakText}>
                {user.stats.dayStreak}d Streak
              </BrandText>
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
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
                  style={[styles.challengeCard, (done || locked) && styles.challengeCardDim]}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({ pathname: '/explore', params: { selectedId: item.id } })
                  }
                >
                  <Image source={{ uri: item.imageUrls[0] }} style={styles.challengeImage} />
                  <View style={styles.challengeInfo}>
                    <BrandText weight="semibold" style={styles.challengeName} numberOfLines={1}>
                      {item.name}
                    </BrandText>
                    <View style={styles.pickAddressRow}>
                      <Ionicons name="location-outline" size={12} color={Brand.inkSecondary} />
                      <BrandText weight="medium" style={styles.pickAddress} numberOfLines={1}>
                        {item.address}
                      </BrandText>
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
                        <BrandText weight="bold" style={styles.tierBadgeText}>Tier {item.tier}</BrandText>
                      </View>
                      <BrandText weight="semibold" style={styles.challengeXp}>
                        +{item.points} XP
                      </BrandText>
                      {worthTrip && (
                        <View style={styles.reachBadge}>
                          <Ionicons name="airplane" size={9} color={Brand.purple} />
                          <BrandText weight="bold" style={styles.reachBadgeText}>
                            Worth the trip
                          </BrandText>
                        </View>
                      )}
                    </View>
                  </View>
                  {locked ? (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={16} color={Brand.inkSubtle} />
                      <BrandText weight="bold" style={styles.lockBadgeText}>Lv {levelForTier(item.tier)}</BrandText>
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
            <View style={styles.sectionTitleRow}>
              <Ionicons name="medal-outline" size={18} color={Brand.ink} />
              <BrandText weight="semibold" style={styles.sectionTitle}>
                This weeks top picks
              </BrandText>
            </View>

            {/* Vertical list of top-pick cards */}
            <View style={styles.verticalList}>
              {topPicks.map(item => {
                const locked = isLocked(item);
                return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.pickCard, locked && styles.challengeCardDim]}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({ pathname: '/explore', params: { selectedId: item.id } })
                  }
                >
                  <Image source={{ uri: item.imageUrls[0] }} style={styles.pickImage} />
                  <View style={styles.pickInfo}>
                    <BrandText weight="semibold" style={styles.pickName} numberOfLines={1}>
                      {item.name}
                    </BrandText>
                    <View style={styles.pickAddressRow}>
                      <Ionicons name="location-outline" size={12} color={Brand.inkSecondary} />
                      <BrandText weight="medium" style={styles.pickAddress} numberOfLines={2}>
                        {item.address}
                      </BrandText>
                    </View>
                    <View style={styles.pickBadgeRow}>
                      <View style={styles.pointsBadge}>
                        <Ionicons name="trophy-outline" size={13} color={Brand.sticker.gold} />
                        <BrandText weight="semibold" style={styles.pointsText}>
                          {item.points} Points
                        </BrandText>
                      </View>
                      <View style={styles.tierBadge}>
                        <BrandText weight="bold" style={styles.tierBadgeText}>Tier {item.tier}</BrandText>
                      </View>
                      {locked && (
                        <View style={styles.lockBadge}>
                          <Ionicons name="lock-closed" size={12} color={Brand.inkSubtle} />
                          <BrandText weight="bold" style={styles.lockBadgeText}>Lv {levelForTier(item.tier)}</BrandText>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Brand.surface,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 5,
    ...stampBorder,
  },
  streakText: {
    fontSize: 12,
    color: Brand.ink,
  },
  gearButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    ...stampBorder,
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
    alignItems: 'flex-start',
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
  challengeXp: {
    fontSize: 12,
    color: Brand.sticker.purple,
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
  lockBadgeText: {
    fontSize: 9,
    color: Brand.inkSubtle,
  },
});
