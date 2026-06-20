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

import { BrandAssets, BrandText } from '@/components/brand';
import { Brand, BrandRadius, Spacing, stampBorder } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { unlockedTier } from '@/utils/leveling';
import { refreshGeofencesOnFocus } from '@/utils/geofencing';
import { User, ExploreLocation } from '@/types';

export default function HomeScreen() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [locations, setLocations] = useState<ExploreLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Authentication check and data loader
  useEffect(() => {
    async function loadData() {
      try {
        const currentUser = await storage.getUser();
        if (!currentUser) {
          // If no user profile exists, redirect to onboarding login flow
          router.replace('/auth/login');
          return;
        }
        setUser(currentUser);
        // Tier-gate: only surface locations whose tier the user has unlocked
        // at their current level (spec 06). Higher tiers stay hidden.
        const allLocs = await storage.getLocations();
        const maxTier = unlockedTier(currentUser.stats.currentLevel);
        setLocations(allLocs.filter((loc) => loc.tier <= maxTier));
      } catch (e) {
        console.error('Failed to load user or locations in Home', e);
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

  // Filter top picks (locations with >= 300 points) and challenge locations
  const topPicks = locations.filter(loc => loc.points >= 300);
  const challenges = locations.filter(loc => loc.points < 300 || loc.id === 'kings_park_lookout');

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
            {/* Streak chip */}
            <View style={styles.streakChip}>
              <Ionicons name="flame" size={14} color="#ef4444" />
              <BrandText weight="semibold" style={styles.streakText}>
                {user.stats.dayStreak}d Streak
              </BrandText>
            </View>
            {/* Settings gear */}
            <TouchableOpacity
              style={styles.gearButton}
              onPress={() => router.push('/profile')}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={20} color={Brand.ink} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── This week's top picks ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="medal-outline" size={18} color={Brand.ink} />
                <BrandText weight="semibold" style={styles.sectionTitle}>
                  This weeks top picks
                </BrandText>
              </View>
              <TouchableOpacity onPress={() => router.push('/explore')} activeOpacity={0.7}>
                <BrandText weight="semibold" style={styles.viewAllLink}>
                  View Map
                </BrandText>
              </TouchableOpacity>
            </View>

            {/* Vertical list of top-pick cards */}
            <View style={styles.verticalList}>
              {topPicks.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.pickCard}
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
                    {/* Points badge */}
                    <View style={styles.pointsBadge}>
                      <Ionicons name="trophy-outline" size={13} color={Brand.sticker.gold} />
                      <BrandText weight="semibold" style={styles.pointsText}>
                        {item.points} Points
                      </BrandText>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Pink "VIEW THEM ALL →" button */}
            <TouchableOpacity
              style={styles.viewAllButton}
              activeOpacity={0.85}
              onPress={() => router.push('/explore')}
            >
              <BrandText weight="bold" style={styles.viewAllButtonText}>
                VIEW THEM ALL →
              </BrandText>
            </TouchableOpacity>
          </View>

          {/* ── Challenge locations ── */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="flag-outline" size={18} color={Brand.ink} />
              <BrandText weight="semibold" style={styles.sectionTitle}>
                Challenge locations
              </BrandText>
            </View>

            <View style={[styles.verticalList, { marginTop: Spacing.three }]}>
              {challenges.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.challengeCard}
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
                      <BrandText weight="semibold" style={styles.challengeXp}>
                        +{item.points} XP
                      </BrandText>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Brand.inkSubtle} />
                </TouchableOpacity>
              ))}
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
});
