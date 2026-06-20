import { Platform } from 'react-native';
import { User, ExploreLocation, CheckIn, Achievement, Coordinates } from '../types';
import { deriveLevelStats, CHECKIN_COOLDOWN_H, maxDiscoverableTier } from './leveling';
import { API_URLS, API_TIMEOUT_MS } from '../constants/config';
import { ACHIEVEMENTS as ACHIEVEMENTS_CATALOGUE, AchievementDef } from '../constants/achievements';

// Let's create mock data
const INITIAL_LOCATIONS: ExploreLocation[] = [
  {
    id: 'mueller_park',
    name: 'Mueller Park',
    category: 'parks',
    coordinates: { latitude: -31.9472, longitude: 115.8291 },
    address: 'Subiaco WA 6008',
    points: 300,
    description: 'A beautiful family park in Subiaco featuring a custom play space, a double slide, and beautiful green lawns perfect for picnics and family gatherings.',
    imageUrls: [
      'https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['playground', 'trees', 'park', 'slide', 'grass'],
    createdAt: '2026-01-10T12:00:00Z',
    tier: 1
  },
  {
    id: 'kings_park_lookout',
    name: 'Kings Park Lookout',
    category: 'scenic',
    coordinates: { latitude: -31.9610, longitude: 115.8422 },
    address: 'Fraser Ave, Perth WA 6005',
    points: 500,
    description: 'A gorgeous scenic viewpoint overlooking the Swan River and Perth CBD. Ideal for sunrise and sunset photography with beautiful botanic gardens.',
    imageUrls: [
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['city view', 'river', 'lookout', 'war memorial', 'garden'],
    createdAt: '2026-01-12T12:00:00Z',
    tier: 1
  },
  {
    id: 'locatour_hq_cafe',
    name: 'Locatour HQ Cafe',
    category: 'food',
    coordinates: { latitude: -31.9530, longitude: 115.8570 },
    address: '45 St Georges Terrace, Perth WA 6000',
    points: 150,
    description: 'Step into our cozy local cafe! Fuel up with premium coffee, enjoy hot bagels, and plan your next street exploration adventure.',
    imageUrls: [
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['coffee', 'cafe', 'neon sign', 'espresso', 'barista'],
    createdAt: '2026-01-15T12:00:00Z',
    tier: 1
  },
  {
    id: 'st_georges_terrace',
    name: "St George's Terrace",
    category: 'scenic',
    coordinates: { latitude: -31.9567, longitude: 115.8598 },
    address: 'St Georges Terrace, Perth WA 6000',
    points: 300,
    description: 'The architectural heart of the city. Look up at the high-rises and explore historical buildings tucked between modern skyscrapers.',
    imageUrls: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['skyscrapers', 'street', 'historic building', 'office'],
    createdAt: '2026-02-01T12:00:00Z',
    tier: 1
  },
  {
    id: 'hyde_park_lake',
    name: 'Hyde Park Lake',
    category: 'parks',
    coordinates: { latitude: -31.9392, longitude: 115.8624 },
    address: 'Vincent St, Perth WA 6000',
    points: 300,
    description: 'Hyde Park is a tranquil inner-city park featuring two lakes, giant plane trees, walking tracks, and active bird-watching points.',
    imageUrls: [
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['lake', 'ducks', 'big trees', 'gazebos', 'pathway'],
    createdAt: '2026-02-10T12:00:00Z',
    tier: 1
  },
  {
    id: 'yanchep_lagoon',
    name: 'Yanchep Lagoon',
    category: 'scenic',
    coordinates: { latitude: -31.5447, longitude: 115.6878 },
    address: 'Yanchep Lagoon, Yanchep WA 6035',
    points: 300,
    description: 'A stunning coastal lagoon with calm turquoise water sheltered by a limestone reef — a local favourite for snorkelling, swimming and sunset picnics.',
    imageUrls: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?auto=format&fit=crop&w=600&q=80'
    ],
    verificationTags: ['beach', 'lagoon', 'ocean', 'reef', 'sand'],
    createdAt: '2026-06-20T00:00:00Z',
    tier: 1,
    geofenceRadius: 1500
  }
];

// Offline Queue Database Interfaces for SQLite
interface SQLiteQueueItem {
  id: string;
  locationId: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  points: number;
}

// In-Memory Fallback State (e.g. for Web / Development)
class StorageManager {
  private user: User | null = null;
  private checkIns: CheckIn[] = [];
  // Achievement CATALOGUE (definitions) — bundled fallback, replaced by the live
  // /api/achievements list once fetched. Unlock state is tracked separately.
  private achievementDefs: AchievementDef[] = ACHIEVEMENTS_CATALOGUE;
  private unlocked: Record<string, string> = {}; // achievement id -> unlockedAt ISO
  private newAchievements: Set<string> = new Set(); // unlocked this session (for the NEW badge)
  private achievementsFetched = false;
  private locations: ExploreLocation[] = INITIAL_LOCATIONS;
  private offlineQueue: SQLiteQueueItem[] = [];
  private db: any = null;

  constructor() {
    this.initDatabase();
    this.loadState();
  }

  private async initDatabase() {
    if (Platform.OS === 'web') return;

    try {
      const SQLiteModule = require('expo-sqlite');
      this.db = SQLiteModule.openDatabaseSync('locatour.db');
      
      // Initialize tables
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS offline_queue (
          id TEXT PRIMARY KEY NOT NULL,
          locationId TEXT NOT NULL,
          photoUrl TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          timestamp TEXT NOT NULL,
          points INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      console.log('SQLite database initialized successfully');
    } catch (e) {
      console.error('Failed to initialize SQLite, falling back to local memory queue', e);
    }
  }

  // Read one persisted value. Web → localStorage; native → the SQLite kv table
  // (there is no window.localStorage in React Native).
  private readKey(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
    if (this.db) {
      const row = this.db.getFirstSync('SELECT value FROM kv WHERE key = ?', [key]) as
        | { value: string }
        | null;
      return row ? row.value : null;
    }
    return null;
  }

  private writeKey(key: string, value: string) {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
      return;
    }
    if (this.db) {
      this.db.runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  private loadState() {
    try {
      const storedUser = this.readKey('locatour_user');
      const storedCheckins = this.readKey('locatour_checkins');
      const storedUnlocked = this.readKey('locatour_ach_unlocked');
      const storedQueue = this.readKey('locatour_queue');

      if (storedUser) {
        this.user = JSON.parse(storedUser);
        // Re-derive level fields from totalXP via leveling.ts so any user saved
        // under the old hand-rolled formula is corrected on load (spec 06).
        if (this.user) {
          Object.assign(this.user.stats, deriveLevelStats(this.user.stats.totalXP));
        }
      }
      if (storedCheckins) this.checkIns = JSON.parse(storedCheckins);
      if (storedUnlocked) this.unlocked = JSON.parse(storedUnlocked) || {};
      if (storedQueue) this.offlineQueue = JSON.parse(storedQueue);

      // Hydrate the last good API location result (if any) so an offline launch
      // shows real locations before getLocations() runs. Stays the bundled mock
      // otherwise. getLocations() will still try the live API on first call.
      const cachedLocations = this.readCachedLocations();
      if (cachedLocations) this.locations = cachedLocations;
    } catch (e) {
      console.error('Failed to load storage state', e);
    }
  }

  private saveState() {
    try {
      if (this.user) this.writeKey('locatour_user', JSON.stringify(this.user));
      this.writeKey('locatour_checkins', JSON.stringify(this.checkIns));
      this.writeKey('locatour_queue', JSON.stringify(this.offlineQueue));
    } catch (e) {
      console.error('Failed to save storage state', e);
    }
  }

  // --- Profile Operations ---
  public async getUser(): Promise<User | null> {
    return this.user;
  }

  public async setUser(user: User): Promise<void> {
    this.user = user;
    this.saveState();
  }

  public async updateProfile(displayName: string, username: string, bio: string, avatarUrl: string, interests?: string[]): Promise<User | null> {
    if (!this.user) return null;
    this.user = {
      ...this.user,
      displayName,
      username: username.startsWith('@') ? username : `@${username}`,
      bio,
      avatarUrl,
      ...(interests ? { interests } : {}),
    };
    this.saveState();
    return this.user;
  }

  public async customizeInterests(gender: string, homeSuburb: string, interests: string[]): Promise<User | null> {
    if (!this.user) {
      // Create empty profile template if not authenticated yet
      this.user = {
        uid: 'user_' + Math.random().toString(36).substr(2, 9),
        displayName: 'New Explorer',
        username: '@explorer',
        bio: '',
        avatarUrl: 'https://api.dicebear.com/7.x/adventurer/png?seed=Explorer&backgroundColor=c0aede',
        gender,
        homeSuburb,
        interests,
        stats: {
          dayStreak: 0,
          totalXP: 0,
          uniqueLocations: 0,
          totalCheckIns: 0,
          // Level fields derived from totalXP via the OSRS curve (leveling.ts)
          // so a fresh profile already reads xpNeededForNextLevel = 83 (L1→L2).
          ...deriveLevelStats(0),
        },
        createdAt: new Date().toISOString()
      };
    } else {
      this.user = {
        ...this.user,
        gender,
        homeSuburb,
        interests
      };
    }
    this.saveState();
    return this.user;
  }

  // --- Location Operations ---
  // Whether the live API has already been queried this session (so repeated
  // screen mounts reuse the in-memory list instead of re-fetching every time).
  private locationsFetched = false;

  // Map one raw API location object → ExploreLocation. The API wraps points/tier
  // under the rich-locations spec (06); we coerce defensively because the mock
  // fallback must stay shape-compatible with whatever the backend ships.
  private mapApiLocation(raw: any): ExploreLocation {
    const tier = Number(raw.tier);
    return {
      id: String(raw.id),
      name: raw.name ?? '',
      category: (raw.category ?? 'parks') as ExploreLocation['category'],
      coordinates: {
        latitude: Number(raw.coordinates?.latitude ?? raw.latitude ?? 0),
        longitude: Number(raw.coordinates?.longitude ?? raw.longitude ?? 0),
      },
      address: raw.address ?? '',
      points: Number(raw.points ?? 0),
      description: raw.description ?? '',
      imageUrls: Array.isArray(raw.imageUrls) ? raw.imageUrls : [],
      verificationTags: Array.isArray(raw.verificationTags) ? raw.verificationTags : [],
      createdAt: raw.createdAt ?? new Date().toISOString(),
      tier: Number.isFinite(tier) && tier >= 1 ? tier : 1,
      tags: Array.isArray(raw.tags) ? raw.tags : undefined,
      categories: Array.isArray(raw.categories) ? raw.categories : undefined,
      geofenceRadius:
        raw.geofenceRadius != null
          ? Number(raw.geofenceRadius)
          : raw.geofence_radius_m != null
            ? Number(raw.geofence_radius_m)
            : undefined,
    };
  }

  // Best-effort fetch of the live locations from the Laravel API. Resolves to a
  // mapped list, or null on any failure/timeout/offline so the caller falls back
  // to the bundled mock. The last good API result is cached in the kv store and
  // hydrated into `this.locations` on construction.
  // Try each candidate API base URL in turn (LAN IP for a phone, 10.0.2.2 for the
  // Android emulator); return the first JSON body, or null if none respond.
  private async fetchFromApi(path: string): Promise<any | null> {
    for (const base of API_URLS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      try {
        const res = await fetch(`${base}${path}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (res.ok) return await res.json();
      } catch (e) {
        // Timeout / offline / DNS / refused — fall through to the next candidate.
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  private async fetchRemoteLocations(): Promise<ExploreLocation[] | null> {
    const body = await this.fetchFromApi('/api/locations');
    if (!body) return null;
    // The API response may be wrapped as { data: [...] } (Laravel resources).
    const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;
    if (!list) return null;
    const mapped = list.map((raw: any) => this.mapApiLocation(raw));
    if (mapped.length === 0) return null;
    // Cache the last good API result so a later offline launch still shows
    // real locations rather than only the bundled mock.
    this.writeKey('locatour_locations_cache', JSON.stringify(mapped));
    return mapped;
  }

  public async getLocations(): Promise<ExploreLocation[]> {
    // After the first successful resolution this session, reuse the in-memory
    // list (already either live API data or the mock fallback).
    if (this.locationsFetched) return this.locations;

    const remote = await this.fetchRemoteLocations();
    if (remote) {
      this.locations = remote;
    } else {
      // Offline / API down: prefer the last good cached API result, else the
      // bundled mock (which carries tier:1 defaults).
      const cached = this.readCachedLocations();
      this.locations = cached ?? INITIAL_LOCATIONS;
    }
    this.locationsFetched = true;
    return this.locations;
  }

  // Read the last good API result from the kv cache, or null if absent/corrupt.
  private readCachedLocations(): ExploreLocation[] | null {
    try {
      const raw = this.readKey('locatour_locations_cache');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  public async getLocationById(id: string): Promise<ExploreLocation | undefined> {
    // Ensure the list has been resolved (API/cache/mock) before looking up.
    if (!this.locationsFetched) await this.getLocations();
    return this.locations.find(loc => loc.id === id);
  }

  // Whether the user may check in to this location right now: true unless their
  // most recent check-in there was within CHECKIN_COOLDOWN_H hours (spec 06).
  public async canCheckIn(locationId: string): Promise<boolean> {
    return this.nextCheckInAt(locationId) === null;
  }

  // The Date the location becomes checkable-in again, or null if it already is.
  // Considers both synced check-ins and the offline queue so a just-queued
  // offline check-in still enforces the cooldown.
  public nextCheckInAt(locationId: string): Date | null {
    const timestamps = this.checkIns
      .filter(c => c.locationId === locationId)
      .map(c => new Date(c.timestamp).getTime());
    for (const item of this.offlineQueue) {
      if (item.locationId === locationId) timestamps.push(new Date(item.timestamp).getTime());
    }
    if (timestamps.length === 0) return null;
    const latest = Math.max(...timestamps);
    const readyAt = latest + CHECKIN_COOLDOWN_H * 60 * 60 * 1000;
    return readyAt > Date.now() ? new Date(readyAt) : null;
  }

  // --- Check-In Operations & Gamification ---
  public async getCheckIns(): Promise<CheckIn[]> {
    return this.checkIns;
  }

  public async addCheckIn(checkIn: CheckIn): Promise<void> {
    // Tier-gating invariant (backstop for any caller): SECRET locations (beyond
    // the hidden discovery range) can never be checked into. Hidden spots within
    // range ARE allowed — that's a discovery. The camera UI also pre-checks.
    const target = this.locations.find((l) => l.id === checkIn.locationId);
    if (this.user && target && target.tier > maxDiscoverableTier(this.user.stats.currentLevel)) {
      throw new Error(`${target.name} is locked.`);
    }

    this.checkIns.push(checkIn);

    // Update user statistics and achievements
    if (this.user) {
      const stats = { ...this.user.stats };
      stats.totalCheckIns += 1;
      
      const uniqueLocIds = new Set(this.checkIns.map(c => c.locationId));
      stats.uniqueLocations = uniqueLocIds.size;

      // Experience Points Math — award the location's points to cumulative XP,
      // then recompute level/progress from totalXP via the authentic OSRS curve
      // (leveling.ts is the single source of truth). Achievement XP is added
      // later in evaluateAchievements, which re-derives these fields again.
      const xpGained = checkIn.pointsEarned;
      stats.totalXP += xpGained;
      Object.assign(stats, deriveLevelStats(stats.totalXP));

      // Check Streaks (simple date diff)
      // Check if last check-in was yesterday, same day, or more
      if (this.checkIns.length > 1) {
        const lastCheckIn = this.checkIns[this.checkIns.length - 2];
        const lastDate = new Date(lastCheckIn.timestamp).toDateString();
        const currentDate = new Date(checkIn.timestamp).toDateString();
        
        if (lastDate !== currentDate) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          if (lastDate === yesterday.toDateString()) {
            stats.dayStreak += 1;
          } else {
            stats.dayStreak = 1;
          }
        }
      } else {
        stats.dayStreak = 1;
      }

      this.user.stats = stats;

      // Re-evaluate the achievement catalogue against the updated stats.
      this.evaluateAchievements();
    }

    this.saveState();
  }

  // Best-effort fetch of the live achievement catalogue (falls back to the
  // bundled ACHIEVEMENTS_CATALOGUE on any failure/timeout/offline).
  private async fetchRemoteAchievements(): Promise<AchievementDef[] | null> {
    const body = await this.fetchFromApi('/api/achievements');
    if (!body) return null;
    const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;
    if (!list || list.length === 0) return null;
    return list.map((r: any): AchievementDef => ({
      id: String(r.id),
      title: r.title ?? '',
      description: r.description ?? '',
      difficulty: (r.difficulty ?? 'Medium') as Achievement['difficulty'],
      category: r.category ?? undefined,
      metric: r.metric ?? 'total_checkins',
      threshold: Number(r.threshold ?? 1),
      points: Number(r.points ?? 0),
      iconName: r.iconName ?? r.icon_name ?? 'trophy-outline',
    }));
  }

  // Compute every metric an achievement rule can reference, from the user's
  // current stats + check-ins (+ resolved locations for tier/category).
  private computeMetrics(): Record<string, number> {
    const stats = this.user?.stats;
    const locById = new Map(this.locations.map((l) => [l.id, l]));

    const byDay: Record<string, number> = {};
    let maxInDay = 0;
    let parks = 0, scenic = 0, food = 0, maxTier = 0;
    const cats = new Set<string>();

    for (const c of this.checkIns) {
      const day = new Date(c.timestamp).toDateString();
      byDay[day] = (byDay[day] || 0) + 1;
      if (byDay[day] > maxInDay) maxInDay = byDay[day];

      const loc = locById.get(c.locationId);
      if (!loc) continue;
      cats.add(loc.category);
      if (loc.category === 'parks') parks++;
      else if (loc.category === 'scenic') scenic++;
      else if (loc.category === 'food') food++;
      if ((loc.tier || 1) > maxTier) maxTier = loc.tier || 1;
    }

    return {
      total_checkins: stats?.totalCheckIns ?? this.checkIns.length,
      unique_locations: stats?.uniqueLocations ?? new Set(this.checkIns.map((c) => c.locationId)).size,
      day_streak: stats?.dayStreak ?? 0,
      total_xp: stats?.totalXP ?? 0,
      level: stats?.currentLevel ?? 1,
      tier_reached: maxTier,
      distinct_categories: cats.size,
      checkins_in_day: maxInDay,
      category_checkins_parks: parks,
      category_checkins_scenic: scenic,
      category_checkins_food: food,
    };
  }

  // Award any not-yet-unlocked achievement whose metric meets its threshold.
  // Achievements are BADGES — they do NOT add to XP (dozens can unlock at once,
  // which would wreck the level curve); `points` is a prestige score on the card.
  private evaluateAchievements(): void {
    const metrics = this.computeMetrics();
    let dirty = false;

    for (const def of this.achievementDefs) {
      if (this.unlocked[def.id]) continue;
      if ((metrics[def.metric] ?? 0) >= def.threshold) {
        this.unlocked[def.id] = new Date().toISOString();
        this.newAchievements.add(def.id);
        dirty = true;
      }
    }

    if (dirty) this.writeKey('locatour_ach_unlocked', JSON.stringify(this.unlocked));
  }

  // The full catalogue (live or bundled) merged with the user's unlock state.
  public async getAchievements(): Promise<Achievement[]> {
    if (!this.achievementsFetched) {
      const remote = await this.fetchRemoteAchievements();
      if (remote && remote.length) this.achievementDefs = remote;
      this.achievementsFetched = true;
      // Make sure already-satisfied achievements show as unlocked on first view.
      this.evaluateAchievements();
    }

    return this.achievementDefs.map((def) => ({
      ...def,
      isUnlocked: !!this.unlocked[def.id],
      unlockedAt: this.unlocked[def.id],
      isNew: this.newAchievements.has(def.id),
    }));
  }

  public async acknowledgeNewAchievements(): Promise<void> {
    this.newAchievements.clear();
  }

  // --- SQLite Offline Queue Operations ---
  public async queueOfflineCheckIn(locationId: string, photoUrl: string, coordinates: Coordinates, points: number): Promise<void> {
    const item: SQLiteQueueItem = {
      id: 'offline_' + Math.random().toString(36).substr(2, 9),
      locationId,
      photoUrl,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      timestamp: new Date().toISOString(),
      points
    };

    if (Platform.OS === 'web' || !this.db) {
      this.offlineQueue.push(item);
      this.saveState();
      console.log('Queued offline checkin in localStorage:', item);
      return;
    }

    try {
      this.db.runSync(`
        INSERT INTO offline_queue (id, locationId, photoUrl, latitude, longitude, timestamp, points)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `, [item.id, item.locationId, item.photoUrl, item.latitude, item.longitude, item.timestamp, item.points]);
      console.log('SQLite: Queued offline checkin:', item);
    } catch (e) {
      console.error('Failed to run insert in SQLite, queueing in memory', e);
      this.offlineQueue.push(item);
      this.saveState();
    }
  }

  public async getQueuedCheckIns(): Promise<CheckIn[]> {
    if (Platform.OS === 'web' || !this.db) {
      return this.offlineQueue.map(item => ({
        id: item.id,
        userId: this.user?.uid || 'anonymous',
        locationId: item.locationId,
        photoUrl: item.photoUrl,
        pointsEarned: item.points,
        timestamp: item.timestamp,
        coordinatesChecked: { latitude: item.latitude, longitude: item.longitude },
        verifiedOffline: true
      }));
    }

    try {
      const rows = this.db.getAllSync('SELECT * FROM offline_queue;');
      return rows.map((item: any) => ({
        id: item.id,
        userId: this.user?.uid || 'anonymous',
        locationId: item.locationId,
        photoUrl: item.photoUrl,
        pointsEarned: item.points,
        timestamp: item.timestamp,
        coordinatesChecked: { latitude: item.latitude, longitude: item.longitude },
        verifiedOffline: true
      }));
    } catch (e) {
      console.error('Failed to fetch from SQLite queue, using memory fallback', e);
      return this.offlineQueue.map(item => ({
        id: item.id,
        userId: this.user?.uid || 'anonymous',
        locationId: item.locationId,
        photoUrl: item.photoUrl,
        pointsEarned: item.points,
        timestamp: item.timestamp,
        coordinatesChecked: { latitude: item.latitude, longitude: item.longitude },
        verifiedOffline: true
      }));
    }
  }

  public async clearQueue(): Promise<void> {
    if (Platform.OS === 'web' || !this.db) {
      this.offlineQueue = [];
      this.saveState();
      return;
    }

    try {
      this.db.runSync('DELETE FROM offline_queue;');
      console.log('SQLite queue cleared successfully');
    } catch (e) {
      console.error('Failed to clear SQLite queue, clearing memory fallback', e);
      this.offlineQueue = [];
      this.saveState();
    }
  }
}

export const storage = new StorageManager();
