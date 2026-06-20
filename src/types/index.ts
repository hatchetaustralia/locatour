export interface UserStats {
  dayStreak: number;
  totalXP: number;
  uniqueLocations: number;
  totalCheckIns: number;
  currentLevel: number;
  currentXPInLevel: number;
  xpNeededForNextLevel: number;
  // Cumulative XP mirror used by leveling.ts' deriveLevelStats (equals totalXP).
  // Optional so profiles saved before the leveling rework still type-check.
  currentXP?: number;
}

export interface User {
  uid: string;
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  gender: string;
  homeSuburb: string;
  interests: string[];
  stats: UserStats;
  createdAt: string;
}

export type LocationCategory = 'parks' | 'scenic' | 'food';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ExploreLocation {
  id: string;
  name: string;
  category: LocationCategory;
  coordinates: Coordinates;
  address: string;
  points: number;
  description: string;
  imageUrls: string[];
  verificationTags: string[];
  createdAt: string;
  // Rich-location / leveling fields (spec 06). `tier` gates visibility by user
  // level; `tags`/`categories` are taxonomy slugs from the API; `geofenceRadius`
  // is the check-in radius in metres.
  tier: number;
  tags?: string[];
  categories?: string[];
  geofenceRadius?: number;
}

export interface CheckIn {
  id: string;
  userId: string;
  locationId: string;
  photoUrl: string;
  pointsEarned: number;
  timestamp: string;
  coordinatesChecked: Coordinates;
  verifiedOffline: boolean;
  syncedAt?: string;
}

export type AchievementDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Elite' | 'Master' | 'Grandmaster';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  points: number;
  iconName: string;
  // Tiered rule (spec 08): the app awards this when `metric` >= `threshold`.
  difficulty: AchievementDifficulty;
  category?: string;
  metric: string;
  threshold: number;
  isUnlocked: boolean;
  unlockedAt?: string;
  isNew?: boolean;
}
