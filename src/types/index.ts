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
  // The original auth/provider (Google) profile photo, captured at sign-in and
  // kept SEPARATELY from avatarUrl so it stays selectable in the avatar picker
  // even after the user picks a preset. Optional: absent for accounts created
  // before this field existed / device-id-only accounts (recovered on the next
  // Google sign-in).
  providerAvatarUrl?: string;
  gender: string;
  homeSuburb: string;
  // Geocoded coordinates of homeSuburb. Used to warm-start the map at the user's
  // base so it opens localized instead of defaulting to a city centre and snapping
  // once GPS resolves. Optional so profiles saved before this feature still parse.
  homeCoordinates?: Coordinates;
  interests: string[];
  stats: UserStats;
  createdAt: string;
}

export type LocationCategory = 'parks' | 'scenic';

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
  // Community check-ins here THIS WEEK (Mon-start), from the locations API. Social
  // proof shown on Home "top picks" cards. Absent on bundled/offline mock spots.
  checkinsThisWeek?: number;
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
  // Major destinations are always shown regardless of distance (they anchor the
  // map); other spots are only surfaced once the user is within VICINITY_RADIUS_M.
  isMajorDestination?: boolean;
}

export interface CheckIn {
  id: string;
  userId: string;
  locationId: string;
  photoUrl: string;
  pointsEarned: number;
  timestamp: string;
  coordinatesChecked: Coordinates;
  // Horizontal accuracy (metres) of the GPS fix used for the check-in, when known.
  gpsAccuracy?: number | null;
  // Raw EXIF tags from the captured photo (device/OS dependent), when available.
  photoExif?: Record<string, any> | null;
  verifiedOffline: boolean;
  syncedAt?: string;
  // Server check-in PK, set once the upload succeeds. Lets the app delete the row
  // server-side (DELETE /api/checkins/{serverId}). Absent for offline-queued
  // check-ins that haven't synced yet — they have no server row to delete.
  serverId?: string | number;
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
