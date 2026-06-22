import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  Dimensions,
  Alert,
  Switch,
  type ListRenderItemInfo,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandText } from '@/components/brand';
import { Brand, BrandFonts, BrandRadius, stampBorder, Spacing } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { checkUsernameAvailable, deleteCheckInNow, UsernameStatus } from '@/utils/account';
import { enableNearbyAlerts, disableNearbyAlerts } from '@/utils/geofencing';
import { NEARBY_ALERTS_BONUS_PCT } from '@/utils/leveling';
import { avatarUri } from '@/utils/avatar';
import { User, Achievement, CheckIn, ExploreLocation } from '@/types';
import { INTERESTS } from '@/constants/interests';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// A single full-screen photo joined with its caption metadata, used by the
// swipeable viewer below.
type ViewerPhoto = {
  uri: string;
  name: string;
  date: string;
};

// Preset avatars reused from the onboarding "Create Profile" flow for consistency.
const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/adventurer/png?seed=Felix&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Aneka&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Jack&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Mia&backgroundColor=d1f4c9',
];

type ProfileTab = 'overview' | 'checkins' | 'achievements';

// A check-in joined with its resolved location (lifted from the standalone
// History tab, which this screen now folds in as a "Recent check-ins" section).
type HistoryEntry = {
  checkIn: CheckIn;
  location: ExploreLocation | undefined;
  pendingSync: boolean;
};

// "3rd March 2024" style date — reused from history.tsx.
const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  const month = d.toLocaleString(undefined, { month: 'long' });
  return `${day}${suffix} ${month} ${d.getFullYear()}`;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ---------------------------------------------------------------------------
// ZoomablePhoto — one full-screen page in the viewer. Pinch-to-zoom and
// double-tap-to-toggle-zoom via react-native-gesture-handler + reanimated.
// A single tap (that isn't a double tap) bubbles up to close the viewer.
// ---------------------------------------------------------------------------
function ZoomablePhoto({ photo, onClose }: { photo: ViewerPhoto; onClose: () => void }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 4));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > 1 ? 1 : 2.5;
      scale.value = withTiming(next);
      savedScale.value = next;
    });

  // Single tap closes — but only when not zoomed in, so a tap to pan doesn't
  // accidentally dismiss. requireExternalGestureToFail keeps double-tap working.
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (scale.value <= 1) runOnJS(onClose)();
    });

  const composed = Gesture.Race(
    pinch,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={styles.viewerPage}>
        <Animated.Image
          source={{ uri: photo.uri }}
          style={[styles.viewerImage, animatedStyle]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// PhotoViewer — full-screen modal with a horizontal paging FlatList of every
// check-in photo. Shows the location name + date overlaid, plus an X to close.
// ---------------------------------------------------------------------------
function PhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: ViewerPhoto[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const current = photos[index];

  const renderItem = ({ item }: ListRenderItemInfo<ViewerPhoto>) => (
    <ZoomablePhoto photo={item} onClose={onClose} />
  );

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.viewerRoot}>
        <FlatList
          data={photos}
          keyExtractor={(_, i) => `viewer-${i}`}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
          }
        />

        {/* Caption overlay (location + date). */}
        {current ? (
          <SafeAreaView style={styles.viewerCaption} edges={['bottom']} pointerEvents="none">
            <BrandText weight="semibold" color={Brand.surface} style={styles.viewerCaptionName}>
              {current.name}
            </BrandText>
            <BrandText weight="medium" color={Brand.surface} style={styles.viewerCaptionDate}>
              {current.date}
            </BrandText>
            {photos.length > 1 ? (
              <BrandText weight="medium" color={Brand.surface} style={styles.viewerCounter}>
                {index + 1} / {photos.length}
              </BrandText>
            ) : null}
          </SafeAreaView>
        ) : null}

        {/* Close button. */}
        <SafeAreaView style={styles.viewerCloseWrap} edges={['top']}>
          <TouchableOpacity
            style={styles.viewerCloseButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={26} color={Brand.surface} />
          </TouchableOpacity>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Tiered difficulty ordering + colours for the achievement tiers.
const DIFFICULTY_ORDER: Record<string, number> = {
  Easy: 0, Medium: 1, Hard: 2, Elite: 3, Master: 4, Grandmaster: 5,
};
const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: '#16a34a', Medium: '#0ea5e9', Hard: '#f59e0b',
  Elite: '#ef4444', Master: '#9333ea', Grandmaster: '#db2777',
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<User | null>(null);
  // Background "Nearby alerts" opt-in (off by default). Initialised synchronously
  // from storage so the switch reflects the saved preference on first paint.
  const [nearbyAlerts, setNearbyAlerts] = useState(() => storage.getNearbyAlertsEnabled());
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [isEditing, setIsEditing] = useState(false);
  // Full-screen photo viewer: the tapped photo's index into `viewerPhotos`,
  // or null when the viewer is closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Delete-check-in confirmation. Holds the entry to remove, the literal 'all'
  // (the dev clear-everything action), or null when the modal is closed.
  const [pendingDelete, setPendingDelete] = useState<HistoryEntry | 'all' | null>(null);
  // True while a delete/clear is in flight, to disable the modal's buttons.
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit-mode form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [editInterests, setEditInterests] = useState<string[]>([]);
  // Live username availability status (mirrors the onboarding screen).
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus | 'checking' | null>(null);
  // Transient "Saved ✓" badge — true for ~1.5s after a successful auto-save.
  const [justSaved, setJustSaved] = useState(false);

  // Auto-save plumbing. `editDirtyRef` guards against the no-op save that would
  // otherwise fire the instant we populate the form on entering edit mode — it's
  // flipped true only on a genuine user edit, and reset when we leave edit mode.
  const editDirtyRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slower in-flight username check can't clobber the
  // result of a newer keystroke.
  const usernameReqId = useRef(0);

  const loadData = useCallback(async () => {
    try {
      const currentUser = await storage.getUser();
      if (!currentUser) {
        router.replace('/auth/login');
        return;
      }
      setUser(currentUser);

      const list = await storage.getAchievements();
      setAchievements(list);

      // Mark any newly unlocked achievements as seen now that they're rendered.
      if (list.some(a => a.isNew)) {
        await storage.acknowledgeNewAchievements();
      }

      // Recent check-ins (folded in from the old History tab).
      const [checkIns, queued] = await Promise.all([
        storage.getCheckIns(),
        storage.getQueuedCheckIns(),
      ]);
      const combined: HistoryEntry[] = [
        ...checkIns.map((c) => ({ checkIn: c, pendingSync: false, location: undefined })),
        ...queued.map((c) => ({ checkIn: c, pendingSync: true, location: undefined })),
      ];
      const resolved = await Promise.all(
        combined.map(async (entry) => ({
          ...entry,
          location: await storage.getLocationById(entry.checkIn.locationId),
        }))
      );
      // Newest first.
      resolved.sort(
        (a, b) =>
          new Date(b.checkIn.timestamp).getTime() - new Date(a.checkIn.timestamp).getTime()
      );
      setEntries(resolved);
    } catch (e) {
      console.error('Failed to load profile data', e);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Live username availability check (debounced ~400ms) ───────────────────
  // Mirrors the onboarding screen. Pass user.uid as device_id so the user's OWN
  // current username reads as available, not "taken". Sits ABOVE the early
  // returns to preserve hook order.
  useEffect(() => {
    if (!isEditing || !user) return;
    const u = editUsername.trim();
    // No feedback when the handle is unchanged from the user's current one —
    // they haven't made a change, so don't flash "that one's free".
    const current = user.username.startsWith('@') ? user.username.slice(1) : user.username;
    if (u.toLowerCase() === current.toLowerCase()) {
      setUsernameStatus(null);
      return;
    }
    if (u.length < 3) {
      setUsernameStatus(u.length === 0 ? null : 'too_short');
      return;
    }
    setUsernameStatus('checking');
    const reqId = ++usernameReqId.current;
    const handle = setTimeout(async () => {
      const status = await checkUsernameAvailable(u, user.uid);
      if (reqId !== usernameReqId.current) return; // a newer keystroke won
      setUsernameStatus(status);
    }, 400);
    return () => clearTimeout(handle);
  }, [editUsername, isEditing, user]);

  // ── Debounced auto-save (~600ms) ──────────────────────────────────────────
  // Saves edits as the user makes them — no explicit Save button. The
  // editDirtyRef guard prevents a no-op save firing the moment we enter edit
  // mode (which populates all the edit* state). Username is conditionally held
  // back when the typed handle isn't valid/available (see CHANGE 2). Sits ABOVE
  // the early returns to preserve hook order.
  useEffect(() => {
    if (!isEditing || !user) return;
    if (!editDirtyRef.current) return; // entering edit mode is not a user change
    // Don't persist an empty display name; just surface the requirement.
    if (!editDisplayName.trim()) {
      setDisplayNameError('Display name is required');
      return;
    }
    setDisplayNameError('');

    const handle = setTimeout(async () => {
      // Keep the last-known-good username unless the typed one is valid. While
      // 'checking'/'too_short'/'taken' we save the OTHER fields and retain the
      // saved username; 'available'/'unknown' (offline) save the typed handle.
      const typed = editUsername.trim();
      const usernameToSave =
        usernameStatus === 'available' || usernameStatus === 'unknown'
          ? typed
          : user.username; // last-known-good (still has its display @)

      const updated = await storage.updateProfile(
        editDisplayName.trim(),
        usernameToSave,
        editBio.trim(),
        editAvatar,
        editInterests,
      );
      if (updated) {
        setUser(updated);
        setJustSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setJustSaved(false), 1500);
      }
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDisplayName, editUsername, editBio, editAvatar, editInterests, usernameStatus, isEditing]);

  const enterEditMode = () => {
    if (!user) return;
    setEditDisplayName(user.displayName);
    // Strip the leading @ so the prefix box owns it, matching the create flow.
    setEditUsername(user.username.startsWith('@') ? user.username.slice(1) : user.username);
    setEditBio(user.bio);
    setEditAvatar(avatarUri(user.avatarUrl, user.displayName));
    setEditInterests(user.interests || []);
    setDisplayNameError('');
    setUsernameError('');
    setUsernameStatus(null);
    setJustSaved(false);
    editDirtyRef.current = false; // populating the form is not a user change
    setIsEditing(true);
  };

  const exitEditMode = () => {
    editDirtyRef.current = false;
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    setJustSaved(false);
    setIsEditing(false);
  };

  const handleUsernameChange = (text: string) => {
    const cleaned = text.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
    editDirtyRef.current = true;
    setEditUsername(cleaned);
    if (usernameError) setUsernameError('');
  };

  const toggleEditInterest = (id: string) => {
    editDirtyRef.current = true;
    setEditInterests((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Toggle background Nearby Alerts. Turning ON shows the required prominent
  // disclosure BEFORE the OS permission request (Google Play background-location
  // policy); turning OFF stops monitoring immediately.
  const handleToggleAlerts = (value: boolean) => {
    if (!value) {
      void disableNearbyAlerts();
      setNearbyAlerts(false);
      return;
    }
    Alert.alert(
      'Turn on Nearby Alerts?',
      `Locatour will use your location in the background — even when the app is closed — to notify you when you wander near a hidden spot, so you discover places as you go about your day.\n\n• You earn +${NEARBY_ALERTS_BONUS_PCT}% points on every check-in while it's on.\n• It only checks your location against nearby spots (battery-light) — never tracked or shared.\n• Turn it off anytime here.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Turn on',
          onPress: async () => {
            const ok = await enableNearbyAlerts();
            setNearbyAlerts(ok);
            if (!ok) {
              Alert.alert(
                'Allow location “All the time”',
                'To get nearby alerts, set Locatour’s location permission to “Allow all the time” in your phone’s Settings.'
              );
            }
          },
        },
      ]
    );
  };

  // Run the pending delete (a single check-in, or 'all' for the dev clear). The
  // server delete is best-effort (DELETE /api/checkins/{id} when we have a server
  // id); the local removal + stats refresh always happen via storage. An unsynced
  // check-in (no server id) is simply deleted locally.
  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      if (pendingDelete === 'all') {
        const removed = await storage.clearAllCheckIns();
        // Fire-and-forget the server-side deletes for any that carry a server id.
        for (const c of removed) {
          const serverId = (c as { serverId?: string | number }).serverId;
          if (serverId != null) void deleteCheckInNow(serverId);
        }
      } else {
        const serverId = (pendingDelete.checkIn as { serverId?: string | number }).serverId;
        if (serverId != null) void deleteCheckInNow(serverId);
        await storage.deleteCheckIn(pendingDelete.checkIn.id);
      }
      // Close the viewer if it was open (indices have shifted) and refresh.
      setViewerIndex(null);
      await loadData();
    } catch (e) {
      console.error('Failed to delete check-in', e);
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }, [pendingDelete, loadData]);

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await storage.logout();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Brand.purple} />
      </SafeAreaView>
    );
  }

  if (!user) return null;

  const { stats } = user;
  const xpProgress =
    stats.xpNeededForNextLevel > 0
      ? Math.min(stats.currentXPInLevel / stats.xpNeededForNextLevel, 1)
      : 0;

  // Achievements sorted by difficulty tier (Easy → Grandmaster), then threshold.
  const sortedAchievements = [...achievements].sort(
    (a, b) =>
      (DIFFICULTY_ORDER[a.difficulty] ?? 9) - (DIFFICULTY_ORDER[b.difficulty] ?? 9) ||
      a.threshold - b.threshold,
  );
  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;

  // Every check-in photo (newest first), resolved to a real image with caption,
  // for the swipeable full-screen viewer. Each entry maps to one timeline node.
  // NOTE: plain consts (not useMemo) — they must NOT be hooks because they sit
  // after the early returns above; a hook here changes the hook count between
  // renders and crashes with "Rendered more hooks than during the previous render".
  const viewerPhotos: ViewerPhoto[] = entries.map((entry) => ({
    uri: entry.checkIn.photoUrl || entry.location?.imageUrls[0] || '',
    name: entry.location?.name ?? 'Unknown location',
    date: formatDate(entry.checkIn.timestamp),
  }));

  // Cumulative points earned across all check-ins — the rewarding "lifetime"
  // tally shown at the top of the timeline.
  const cumulativePoints = entries.reduce(
    (sum, entry) => sum + (entry.checkIn.pointsEarned || 0),
    0,
  );

  const openViewer = (index: number) => setViewerIndex(index);

  // ---------------------------------------------------------------------------
  // EDIT MODE
  // ---------------------------------------------------------------------------
  if (isEditing) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.editHeader}>
          <TouchableOpacity
            style={[styles.iconSquare, stampBorder]}
            onPress={exitEditMode}
          >
            <Ionicons name="arrow-back-outline" size={20} color={Brand.ink} />
          </TouchableOpacity>
          <BrandText weight="semibold" style={styles.editHeaderTitle}>Edit Profile</BrandText>
          {/* Subtle transient "Saved ✓" badge — auto-save means no Save button. */}
          {justSaved ? (
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={Brand.sticker.green} />
              <BrandText weight="semibold" color={Brand.sticker.green} style={styles.savedBadgeText}>
                Saved
              </BrandText>
            </View>
          ) : (
            <View style={styles.iconSquarePlaceholder} />
          )}
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar + presets */}
          <View style={styles.editAvatarRow}>
            <View style={[styles.editAvatarCircle, stampBorder, styles.roundedFull]}>
              <Image source={{ uri: editAvatar }} style={styles.editAvatarImage} />
            </View>
            <View style={styles.editAvatarMeta}>
              <BrandText weight="medium" style={styles.label}>Choose avatar</BrandText>
              <View style={styles.presetsRow}>
                {AVATAR_PRESETS.map((preset) => {
                  const selected = editAvatar === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      activeOpacity={0.85}
                      style={[
                        styles.presetItem,
                        stampBorder,
                        styles.roundedFull,
                        selected && styles.presetItemSelected,
                      ]}
                      onPress={() => {
                        editDirtyRef.current = true;
                        setEditAvatar(preset);
                      }}
                    >
                      <Image source={{ uri: preset }} style={styles.presetImage} />
                      {selected && (
                        <View style={styles.checkmarkBadge}>
                          <Ionicons name="checkmark" size={10} color={Brand.surface} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Display name */}
          <View style={styles.fieldGroup}>
            <BrandText weight="medium" style={styles.label}>Display name</BrandText>
            <View
              style={[
                styles.inputRow,
                stampBorder,
                displayNameError ? styles.inputRowError : null,
              ]}
            >
              <TextInput
                style={styles.inputField}
                placeholder="e.g. Brandon Watson"
                placeholderTextColor={Brand.inkSubtle}
                value={editDisplayName}
                onChangeText={(text) => {
                  editDirtyRef.current = true;
                  setEditDisplayName(text);
                  if (displayNameError) setDisplayNameError('');
                }}
              />
            </View>
            {displayNameError ? (
              <BrandText weight="medium" style={styles.errorText}>{displayNameError}</BrandText>
            ) : null}
          </View>

          {/* Username */}
          <View style={styles.fieldGroup}>
            <BrandText weight="medium" style={styles.label}>Username</BrandText>
            <View
              style={[
                styles.inputRow,
                stampBorder,
                (usernameError || usernameStatus === 'taken') ? styles.inputRowError : null,
              ]}
            >
              <BrandText weight="medium" style={styles.atPrefix}>@</BrandText>
              <TextInput
                style={styles.inputField}
                placeholder="brandon.hatchet"
                placeholderTextColor={Brand.inkSubtle}
                value={editUsername}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {usernameStatus === 'checking' ? (
                <ActivityIndicator size="small" color={Brand.inkSubtle} />
              ) : usernameStatus === 'available' ? (
                <Ionicons name="checkmark-circle" size={18} color={Brand.sticker.green} />
              ) : usernameStatus === 'taken' ? (
                <Ionicons name="close-circle" size={18} color="#d1453b" />
              ) : null}
            </View>
            {usernameError ? (
              <BrandText weight="medium" style={styles.errorText}>{usernameError}</BrandText>
            ) : usernameStatus === 'available' ? (
              <BrandText weight="medium" style={styles.availableText}>Nice — that one&apos;s free</BrandText>
            ) : usernameStatus === 'taken' ? (
              <BrandText weight="medium" style={styles.errorText}>That username is taken</BrandText>
            ) : null}
          </View>

          {/* Bio */}
          <View style={styles.fieldGroup}>
            <View style={styles.bioLabelRow}>
              <BrandText weight="medium" style={styles.label}>Bio</BrandText>
              <BrandText weight="medium" style={styles.charCounter}>{editBio.length}/150</BrandText>
            </View>
            <View style={[styles.inputRow, styles.bioInputRow, stampBorder]}>
              <TextInput
                style={[styles.inputField, styles.bioInputField]}
                placeholder="I love hiking and skating 🏄..."
                placeholderTextColor={Brand.inkSubtle}
                value={editBio}
                onChangeText={(text) => {
                  if (text.length <= 150) {
                    editDirtyRef.current = true;
                    setEditBio(text);
                  }
                }}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Interests — refine the categories you care about */}
          <View style={styles.fieldGroup}>
            <BrandText weight="medium" style={styles.label}>Interests</BrandText>
            <View style={styles.interestGrid}>
              {INTERESTS.map((interest) => {
                const selected = editInterests.includes(interest.id);
                return (
                  <TouchableOpacity
                    key={interest.id}
                    activeOpacity={0.85}
                    style={[styles.interestCard, stampBorder, selected && styles.interestCardSelected]}
                    onPress={() => toggleEditInterest(interest.id)}
                  >
                    <Ionicons name={interest.icon} size={22} color={Brand.ink} />
                    <BrandText weight="medium" color={Brand.ink} style={styles.interestCardText}>
                      {interest.name}
                    </BrandText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* No save/done button: edits auto-save as you type, and the back arrow
              (top-left) leaves edit mode. */}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW MODE
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
      >
        {/* Top bar: help/walkthrough top-left, settings gear top-right */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.iconSquare, stampBorder]}
            onPress={() => router.push('/auth/walkthrough?help=1')}
          >
            <Ionicons name="help-circle-outline" size={22} color={Brand.ink} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconSquare, stampBorder]} onPress={enterEditMode}>
            <Ionicons name="settings-outline" size={20} color={Brand.ink} />
          </TouchableOpacity>
        </View>

        {/* Avatar with hexagon level badge */}
        <View style={styles.avatarHeader}>
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatarRing, stampBorder, styles.roundedFull]}>
              <Image
                source={{ uri: avatarUri(user.avatarUrl, user.displayName) }}
                style={styles.avatarLarge}
              />
            </View>
            {/* Solid pink level badge (Ionicons has no "hexagon" glyph, which
                rendered as a "?" — use a styled badge instead). */}
            <View style={[styles.levelHex, stampBorder]}>
              <BrandText weight="bold" color={Brand.bg} style={styles.levelHexText}>
                {stats.currentLevel}
              </BrandText>
            </View>
          </View>

          <BrandText weight="semibold" style={styles.displayName}>{user.displayName}</BrandText>
          <BrandText weight="medium" style={styles.username}>{user.username}</BrandText>
          {user.homeSuburb ? (
            <View style={styles.suburbRow}>
              <Ionicons name="location" size={14} color={Brand.purple} />
              <BrandText weight="medium" color={Brand.inkSecondary} style={styles.suburbText}>
                {user.homeSuburb}
              </BrandText>
            </View>
          ) : null}
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          {(['overview', 'checkins', 'achievements'] as ProfileTab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <BrandText
                  weight={isActive ? 'semibold' : 'medium'}
                  color={isActive ? Brand.purple : Brand.ink}
                  style={styles.tabText}
                >
                  {tab === 'overview' ? 'Overview' : tab === 'checkins' ? 'Check-ins' : 'Achievements'}
                </BrandText>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'overview' ? (
          <View style={styles.tabContent}>
            {/* Bio */}
            <View style={styles.overviewBlock}>
              <BrandText weight="medium" style={styles.blockTitle}>Bio</BrandText>
              <BrandText weight="medium" style={styles.bioText}>
                {user.bio ? user.bio : 'No bio yet. Tap the settings icon to add one.'}
              </BrandText>
            </View>

            {/* Level XP progress */}
            <View style={styles.overviewBlock}>
              <BrandText weight="medium" style={styles.blockTitle}>Level</BrandText>
              <View style={styles.xpRow}>
                <View style={[styles.levelBadge, styles.roundedFull, { backgroundColor: Brand.sticker.pink }]}>
                  <BrandText weight="bold" color={Brand.bg} style={styles.levelBadgeText}>
                    {stats.currentLevel}
                  </BrandText>
                </View>
                <View style={styles.progressColumn}>
                  <View style={styles.progressBarBackground}>
                    <View style={[styles.progressBarActive, { width: `${xpProgress * 100}%` }]} />
                  </View>
                  <BrandText weight="medium" style={styles.xpCounter}>
                    {stats.currentXPInLevel}/{stats.xpNeededForNextLevel}
                  </BrandText>
                </View>
                <View style={[styles.levelBadge, styles.roundedFull, { backgroundColor: Brand.purple }]}>
                  <BrandText weight="bold" color={Brand.bg} style={styles.levelBadgeText}>
                    {stats.currentLevel + 1}
                  </BrandText>
                </View>
              </View>
            </View>

            {/* Stats grid 2x2 */}
            <View style={styles.statsGrid}>
              <StatCard icon="flame" color={Brand.sticker.pink} value={stats.dayStreak} label="Day streak" />
              <StatCard icon="flash" color={Brand.sticker.gold} value={stats.totalXP} label="Total XP" />
              <StatCard icon="location" color={Brand.purple} value={stats.uniqueLocations} label="Unique locations" />
              <StatCard icon="map" color={Brand.sticker.green} value={stats.totalCheckIns} label="Total check-ins" />
            </View>

            {/* Nearby alerts opt-in — incentivised with a points multiplier. */}
            <View style={[styles.alertsCard, stampBorder]}>
              <View style={styles.alertsInfo}>
                <View style={styles.alertsTitleRow}>
                  <Ionicons name="notifications" size={16} color={Brand.purple} />
                  <BrandText weight="semibold" style={styles.blockTitle}>Nearby alerts</BrandText>
                  <View style={styles.alertsBonusPill}>
                    <BrandText weight="bold" color={Brand.bg} style={styles.alertsBonusText}>+{NEARBY_ALERTS_BONUS_PCT}% pts</BrandText>
                  </View>
                </View>
                <BrandText weight="medium" color={Brand.inkSecondary} style={styles.alertsSubtitle}>
                  Get pinged when you wander near a hidden spot — and earn +{NEARBY_ALERTS_BONUS_PCT}% points on every check-in.
                </BrandText>
              </View>
              <Switch
                value={nearbyAlerts}
                onValueChange={handleToggleAlerts}
                trackColor={{ true: Brand.purple, false: 'rgba(42,36,33,0.2)' }}
                thumbColor="#fff"
              />
            </View>

            {/* Interests */}
            {user.interests.length > 0 && (
              <View style={styles.overviewBlock}>
                <BrandText weight="medium" style={styles.blockTitle}>Interests</BrandText>
                <View style={styles.chipsRow}>
                  {user.interests.map((interest) => (
                    <View key={interest} style={[styles.chip, stampBorder]}>
                      <BrandText weight="semibold" color={Brand.purple} style={styles.chipText}>
                        {interest}
                      </BrandText>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Check-in timeline (folded in from History) */}
            <View style={styles.overviewBlock}>
              <View style={styles.timelineHeader}>
                <BrandText weight="medium" style={styles.blockTitle}>Your journey</BrandText>
                {entries.length > 0 ? (
                  <BrandText weight="medium" color={Brand.inkSecondary} style={styles.timelineCount}>
                    {entries.length} {entries.length === 1 ? 'stop' : 'stops'}
                  </BrandText>
                ) : null}
              </View>

              {entries.length === 0 ? (
                <View style={[styles.emptyCard, stampBorder]}>
                  <Ionicons name="map-outline" size={28} color={Brand.purple} />
                  <BrandText weight="semibold" style={styles.emptyTitle}>
                    No check-ins yet — go explore!
                  </BrandText>
                  <BrandText weight="medium" color={Brand.inkSecondary} style={styles.emptyText}>
                    Explore the map and check in to start your journey.
                  </BrandText>
                </View>
              ) : (
                <>
                  {/* Cumulative-points reward summary. */}
                  <View style={[styles.pointsSummary, stampBorder]}>
                    <View style={[styles.pointsSummaryIcon, styles.roundedFull]}>
                      <Ionicons name="trophy" size={20} color={Brand.bg} />
                    </View>
                    <View style={styles.pointsSummaryText}>
                      <BrandText weight="bold" style={styles.pointsSummaryValue}>
                        {cumulativePoints.toLocaleString()}
                      </BrandText>
                      <BrandText weight="medium" color={Brand.inkSecondary} style={styles.pointsSummaryLabel}>
                        points earned exploring
                      </BrandText>
                    </View>
                  </View>

                  {/* Vertical timeline: connector line + dated nodes + thumbs. */}
                  <View style={styles.timeline}>
                    {entries.map((entry, idx) => {
                      const loc = entry.location;
                      const isLast = idx === entries.length - 1;
                      const thumbUri = entry.checkIn.photoUrl || loc?.imageUrls[0];
                      return (
                        <View key={entry.checkIn.id} style={styles.timelineRow}>
                          {/* Rail: node dot + connector line. */}
                          <View style={styles.timelineRail}>
                            <View style={[styles.timelineNode, styles.roundedFull]} />
                            {!isLast ? <View style={styles.timelineLine} /> : null}
                          </View>

                          {/* Card. */}
                          <View style={styles.timelineCardWrap}>
                            <View style={[styles.checkInCard, stampBorder]}>
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => openViewer(idx)}
                              >
                                <Image source={{ uri: thumbUri }} style={styles.checkInImage} />
                                <View style={styles.checkInImageBadge}>
                                  <Ionicons name="expand-outline" size={12} color={Brand.bg} />
                                </View>
                              </TouchableOpacity>
                              <View style={styles.checkInInfo}>
                                <BrandText weight="semibold" style={styles.checkInName} numberOfLines={1}>
                                  {loc?.name ?? 'Unknown location'}
                                </BrandText>
                                <View style={styles.checkInMetaRow}>
                                  <View style={styles.checkInMetaItem}>
                                    <Ionicons name="calendar-outline" size={12} color={Brand.inkSubtle} />
                                    <BrandText weight="medium" color={Brand.inkSecondary} style={styles.checkInMetaText}>
                                      {formatDate(entry.checkIn.timestamp)}
                                    </BrandText>
                                  </View>
                                  <View style={styles.checkInMetaItem}>
                                    <Ionicons name="time-outline" size={12} color={Brand.inkSubtle} />
                                    <BrandText weight="medium" color={Brand.inkSecondary} style={styles.checkInMetaText}>
                                      {formatTime(entry.checkIn.timestamp)}
                                    </BrandText>
                                  </View>
                                </View>
                                <View style={styles.checkInBadges}>
                                  <View style={[styles.pointsBadgeBig, stampBorder]}>
                                    <Ionicons name="trophy" size={13} color={Brand.bg} />
                                    <BrandText weight="bold" color={Brand.bg} style={styles.pointsTextBig}>
                                      +{entry.checkIn.pointsEarned} pts
                                    </BrandText>
                                  </View>
                                  {entry.pendingSync && (
                                    <View style={[styles.pendingBadge, stampBorder]}>
                                      <Ionicons name="cloud-upload-outline" size={11} color={Brand.sticker.pink} />
                                      <BrandText weight="semibold" color={Brand.sticker.pink} style={styles.pendingText}>
                                        Pending sync
                                      </BrandText>
                                    </View>
                                  )}
                                </View>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Log out — clears the profile and returns to the auth flow. */}
              <TouchableOpacity
                style={[styles.logoutButton, stampBorder]}
                activeOpacity={0.85}
                onPress={handleLogout}
              >
                <Ionicons name="log-out-outline" size={18} color={Brand.sticker.pink} />
                <BrandText weight="bold" color={Brand.sticker.pink} style={styles.logoutText}>
                  Log out
                </BrandText>
              </TouchableOpacity>
            </View>
          </View>
        ) : activeTab === 'checkins' ? (
          <View style={styles.tabContent}>
            {entries.length === 0 ? (
              <View style={[styles.emptyCard, stampBorder]}>
                <Ionicons name="images-outline" size={28} color={Brand.purple} />
                <BrandText weight="semibold" style={styles.emptyTitle}>
                  No check-ins yet — go explore!
                </BrandText>
                <BrandText weight="medium" color={Brand.inkSecondary} style={styles.emptyText}>
                  Check in at a location to start your collection.
                </BrandText>
              </View>
            ) : (
              <>
                {/* Hint so the tap-to-view / long-press-to-delete is discoverable. */}
                <BrandText weight="medium" color={Brand.inkSecondary} style={styles.checkinsHint}>
                  Tap a photo to view it, or long-press to delete.
                </BrandText>
                <View style={styles.galleryGrid}>
                  {entries.map((entry, idx) => (
                    <TouchableOpacity
                      key={entry.checkIn.id}
                      activeOpacity={0.85}
                      style={[styles.galleryItem, stampBorder]}
                      onPress={() => openViewer(idx)}
                      onLongPress={() => setPendingDelete(entry)}
                      delayLongPress={300}
                    >
                      <Image
                        source={{ uri: entry.checkIn.photoUrl || entry.location?.imageUrls[0] }}
                        style={styles.galleryImage}
                      />
                      {/* Tap-target delete badge (long-press still works too). */}
                      <TouchableOpacity
                        style={styles.galleryDeleteBadge}
                        onPress={() => setPendingDelete(entry)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash" size={12} color={Brand.bg} />
                      </TouchableOpacity>
                      <View style={styles.galleryCaption}>
                        <BrandText weight="semibold" color={Brand.bg} style={styles.galleryName} numberOfLines={1}>
                          {entry.location?.name ?? 'Unknown'}
                        </BrandText>
                        <BrandText weight="medium" color={Brand.bg} style={styles.galleryDate} numberOfLines={1}>
                          {formatDate(entry.checkIn.timestamp)}
                        </BrandText>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Developer-only: wipe every check-in (server + local) while
                    testing. __DEV__ is false in production builds, so this never
                    ships to users. */}
                {__DEV__ ? (
                  <TouchableOpacity
                    style={[styles.devClearButton, stampBorder]}
                    activeOpacity={0.85}
                    onPress={() => setPendingDelete('all')}
                  >
                    <Ionicons name="bug-outline" size={16} color={Brand.sticker.pink} />
                    <BrandText weight="bold" color={Brand.sticker.pink} style={styles.devClearText}>
                      Clear all check-ins (dev)
                    </BrandText>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        ) : (
          <View style={styles.tabContent}>
            <View style={styles.achievementsHeader}>
              <BrandText weight="semibold" style={styles.blockTitle}>Achievements</BrandText>
              <View style={styles.achievementsCountPill}>
                <Ionicons name="trophy" size={12} color={Brand.sticker.gold} />
                <BrandText weight="bold" style={styles.achievementsCountText}>
                  {unlockedCount}/{achievements.length}
                </BrandText>
              </View>
            </View>
            <View style={styles.achievementsGrid}>
              {sortedAchievements.map((ach) => {
                const diffColor = DIFFICULTY_COLOR[ach.difficulty] ?? Brand.inkSubtle;
                return (
                  <View
                    key={ach.id}
                    style={[
                      styles.achievementCard,
                      stampBorder,
                      !ach.isUnlocked && styles.achievementLocked,
                    ]}
                  >
                    {ach.isNew && (
                      <View style={[styles.newBadge, styles.roundedFull]}>
                        <BrandText weight="bold" color={Brand.bg} style={styles.newBadgeText}>NEW</BrandText>
                      </View>
                    )}
                    {!ach.isUnlocked && (
                      <View style={styles.lockBadge}>
                        <Ionicons name="lock-closed" size={12} color={Brand.inkSubtle} />
                      </View>
                    )}

                    <Ionicons
                      name={ach.iconName as keyof typeof Ionicons.glyphMap}
                      size={36}
                      color={ach.isUnlocked ? diffColor : Brand.inkSubtle}
                      style={styles.achievementIcon}
                    />
                    <View style={styles.achievementBody}>
                      <View style={[styles.difficultyChip, { backgroundColor: diffColor }]}>
                        <BrandText weight="bold" color={Brand.bg} style={styles.difficultyChipText}>
                          {ach.difficulty}
                        </BrandText>
                      </View>
                      <BrandText weight="semibold" style={styles.achievementTitle} numberOfLines={1}>
                        {ach.title}
                      </BrandText>
                      <BrandText weight="medium" color={Brand.inkSecondary} style={styles.achievementDesc}>
                        {ach.description}
                      </BrandText>
                      <View style={styles.achievementPoints}>
                        <Ionicons name="trophy" size={12} color={Brand.sticker.gold} />
                        <BrandText weight="semibold" color={Brand.sticker.gold} style={styles.achievementPointsText}>
                          {ach.points}
                        </BrandText>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {viewerIndex !== null && viewerPhotos.length > 0 ? (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}

      {/* Delete confirmation — single check-in or the dev "clear all". */}
      <Modal
        visible={pendingDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => (isDeleting ? null : setPendingDelete(null))}
      >
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, stampBorder]}>
            <BrandText weight="semibold" style={styles.confirmTitle}>
              {pendingDelete === 'all' ? 'Clear all check-ins?' : 'Delete check-in?'}
            </BrandText>
            <BrandText weight="medium" color={Brand.inkSecondary} style={styles.confirmBody}>
              {pendingDelete === 'all'
                ? "This removes every check-in from your collection. This can't be undone."
                : "This removes it from your check-ins. This can't be undone."}
            </BrandText>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel, stampBorder]}
                activeOpacity={0.85}
                disabled={isDeleting}
                onPress={() => setPendingDelete(null)}
              >
                <BrandText weight="bold" color={Brand.ink} style={styles.confirmButtonText}>
                  Cancel
                </BrandText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmDelete, stampBorder]}
                activeOpacity={0.85}
                disabled={isDeleting}
                onPress={confirmDelete}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={Brand.bg} />
                ) : (
                  <BrandText weight="bold" color={Brand.bg} style={styles.confirmButtonText}>
                    Delete
                  </BrandText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: number;
  label: string;
}

function StatCard({ icon, color, value, label }: StatCardProps) {
  return (
    <View style={[styles.statCard, stampBorder]}>
      <Ionicons name={icon} size={24} color={color} />
      <View style={styles.statTextWrap}>
        <BrandText weight="semibold" style={styles.statValue}>{value}</BrandText>
        <BrandText weight="medium" color={Brand.inkSecondary} style={styles.statLabel} numberOfLines={1}>
          {label}
        </BrandText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 80,
  },
  roundedFull: {
    borderRadius: BrandRadius.pill,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.two,
  },
  iconSquare: {
    width: 38,
    height: 38,
    borderBottomWidth: 3,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSquarePlaceholder: {
    width: 38,
    height: 38,
  },

  // Avatar header
  avatarHeader: {
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: Spacing.three,
  },
  avatarRing: {
    width: 170,
    height: 170,
    borderBottomWidth: 2,
    overflow: 'hidden',
    backgroundColor: Brand.surface,
  },
  avatarLarge: {
    width: '100%',
    height: '100%',
    backgroundColor: Brand.surface,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelHex: {
    position: 'absolute',
    top: 4,
    right: -4,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Brand.sticker.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelHexText: {
    fontSize: 16,
  },
  displayName: {
    fontSize: 18,
    color: Brand.ink,
  },
  username: {
    fontSize: 16,
    color: 'rgba(42,36,33,0.5)',
  },
  suburbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.one,
  },
  suburbText: {
    fontSize: 13,
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,36,33,0.1)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(42,36,33,0.1)',
    marginBottom: Spacing.three,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -2,
  },
  tabActive: {
    borderBottomColor: Brand.purple,
  },
  tabText: {
    fontSize: 14,
  },
  tabContent: {
    gap: Spacing.four,
  },

  // Log out button (bottom of Overview)
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.surface,
    paddingVertical: Spacing.three,
    borderRadius: BrandRadius.control,
    marginTop: Spacing.two,
  },
  logoutText: {
    fontSize: 14,
  },

  // Overview blocks
  overviewBlock: {
    gap: Spacing.two,
  },
  blockTitle: {
    fontSize: 16,
    color: Brand.ink,
  },
  // Nearby-alerts opt-in card
  alertsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Brand.surface,
    borderRadius: BrandRadius.sticker,
    padding: Spacing.three,
  },
  alertsInfo: {
    flex: 1,
    gap: 4,
  },
  alertsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  alertsBonusPill: {
    backgroundColor: Brand.purple,
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 1,
    borderRadius: BrandRadius.pill,
  },
  alertsBonusText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  alertsSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 22,
    color: Brand.ink,
  },

  // Level XP
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  levelBadge: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderColor: Brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: {
    fontSize: 20,
  },
  progressColumn: {
    flex: 1,
    gap: 4,
  },
  progressBarBackground: {
    height: 16,
    borderRadius: BrandRadius.pill,
    borderWidth: 1,
    borderColor: Brand.ink,
    backgroundColor: Brand.surface,
    overflow: 'hidden',
  },
  progressBarActive: {
    height: '100%',
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.purple,
  },
  xpCounter: {
    fontSize: 10,
    color: 'rgba(42,36,33,0.4)',
    alignSelf: 'flex-end',
    marginRight: 4,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Brand.bg,
    borderColor: 'rgba(42,36,33,0.2)',
  },
  statTextWrap: {
    flex: 1,
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    color: Brand.ink,
  },
  statLabel: {
    fontSize: 13,
  },

  // Interests chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.surface,
  },
  chipText: {
    fontSize: 13,
    textTransform: 'capitalize',
  },

  // Recent check-ins
  checkInList: {
    gap: Spacing.two,
  },
  emptyCard: {
    backgroundColor: Brand.surface,
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  emptyTitle: {
    fontSize: 15,
    color: Brand.ink,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Timeline header
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineCount: {
    fontSize: 13,
  },

  // Cumulative-points reward summary
  pointsSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    backgroundColor: '#FDF3DA',
  },
  pointsSummaryIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.sticker.gold,
  },
  pointsSummaryText: {
    flex: 1,
  },
  pointsSummaryValue: {
    fontSize: 24,
    color: Brand.ink,
  },
  pointsSummaryLabel: {
    fontSize: 12,
  },

  // Timeline
  timeline: {
    marginTop: Spacing.two,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineRail: {
    width: 24,
    alignItems: 'center',
  },
  timelineNode: {
    width: 14,
    height: 14,
    marginTop: 6,
    backgroundColor: Brand.purple,
    borderWidth: 2,
    borderColor: Brand.bg,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 2,
    marginBottom: 2,
    backgroundColor: 'rgba(129,65,220,0.35)',
  },
  timelineCardWrap: {
    flex: 1,
    paddingBottom: Spacing.three,
  },
  checkInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    gap: Spacing.three,
    backgroundColor: Brand.surface,
  },
  checkInImage: {
    width: 60,
    height: 72,
    borderRadius: BrandRadius.control,
    backgroundColor: Brand.bg,
  },
  checkInImageBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(42,36,33,0.6)',
    borderRadius: BrandRadius.pill,
    padding: 3,
  },
  checkInInfo: {
    flex: 1,
    gap: 4,
  },
  checkInName: {
    fontSize: 15,
    color: Brand.ink,
  },
  checkInMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkInMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  checkInMetaText: {
    fontSize: 12,
  },
  checkInBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: 2,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#FDF3DA',
  },
  pointsText: {
    fontSize: 11,
  },
  // Prominent gold points badge for the timeline cards.
  pointsBadgeBig: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.sticker.gold,
  },
  pointsTextBig: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#FBE4EC',
  },
  pendingText: {
    fontSize: 10,
  },

  // Check-ins grid (the photo collection)
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  galleryItem: {
    width: '31.7%',
    aspectRatio: 0.82,
    borderRadius: BrandRadius.control,
    overflow: 'hidden',
    backgroundColor: Brand.surface,
    position: 'relative',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  galleryCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(42,36,33,0.6)',
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  galleryName: {
    fontSize: 10,
  },
  galleryDate: {
    fontSize: 8,
    opacity: 0.85,
  },
  // Discoverability hint above the check-ins grid.
  checkinsHint: {
    fontSize: 12,
    marginBottom: Spacing.one,
  },
  // Small trash badge overlaid top-right of each check-in thumbnail.
  galleryDeleteBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(42,36,33,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  // Dev-only "Clear all check-ins" button (gated by __DEV__).
  devClearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.surface,
    paddingVertical: Spacing.three,
    borderRadius: BrandRadius.control,
    marginTop: Spacing.three,
  },
  devClearText: {
    fontSize: 14,
  },
  // Delete confirmation modal.
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
  confirmButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  confirmButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BrandRadius.control,
  },
  confirmCancel: {
    backgroundColor: Brand.surface,
  },
  confirmDelete: {
    backgroundColor: Brand.sticker.pink,
  },
  confirmButtonText: {
    fontSize: 15,
  },

  // Achievements grid
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  achievementsCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDF3DA',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
  },
  achievementsCountText: {
    fontSize: 13,
    color: '#b46c00',
  },
  difficultyChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BrandRadius.pill,
    marginBottom: 2,
  },
  difficultyChipText: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
  // Single-column, full-width vertical list of taller achievement cards.
  achievementsGrid: {
    gap: Spacing.three,
  },
  achievementCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    position: 'relative',
    backgroundColor: Brand.surface,
  },
  achievementBody: {
    flex: 1,
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  achievementLocked: {
    opacity: 0.55,
    backgroundColor: Brand.bg,
  },
  achievementIcon: {
    marginHorizontal: Spacing.one,
  },
  achievementTitle: {
    fontSize: 15,
    color: Brand.ink,
  },
  achievementDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  achievementPoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.one,
  },
  achievementPointsText: {
    fontSize: 12,
  },
  newBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Brand.sticker.pink,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    zIndex: 1,
  },
  newBadgeText: {
    fontSize: 9,
  },
  lockBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    zIndex: 1,
  },

  // ---- Edit mode ----
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  editHeaderTitle: {
    fontSize: 18,
    color: Brand.ink,
  },
  editAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.four,
    marginTop: Spacing.two,
  },
  editAvatarCircle: {
    width: 80,
    height: 80,
    borderBottomWidth: 2,
    overflow: 'hidden',
    backgroundColor: Brand.surface,
  },
  editAvatarImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Brand.surface,
  },
  editAvatarMeta: {
    flex: 1,
    gap: Spacing.two,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  presetItem: {
    width: 44,
    height: 44,
    borderBottomWidth: 2,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Brand.surface,
  },
  presetItemSelected: {
    borderColor: Brand.purple,
  },
  presetImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Brand.surface,
  },
  checkmarkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Brand.purple,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Brand.surface,
  },

  fieldGroup: {
    marginBottom: Spacing.three,
    gap: 3,
  },
  interestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  interestCard: {
    width: '31.5%',
    paddingVertical: Spacing.three,
    marginBottom: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Brand.surface,
  },
  interestCardSelected: {
    backgroundColor: Brand.teal,
  },
  interestCardText: {
    fontSize: 12,
  },
  label: {
    fontSize: 14,
    color: Brand.ink,
  },
  bioLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCounter: {
    fontSize: 12,
    color: Brand.inkSubtle,
  },
  errorText: {
    color: '#d1453b',
    fontSize: 12,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    gap: 6,
    backgroundColor: Brand.surface,
  },
  inputRowError: {
    borderColor: '#d1453b',
  },
  inputField: {
    flex: 1,
    height: '100%',
    fontFamily: BrandFonts.medium,
    fontSize: 14,
    color: Brand.ink,
  },
  atPrefix: {
    fontSize: 14,
    color: Brand.inkSubtle,
  },
  bioInputRow: {
    height: 100,
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  bioInputField: {
    height: undefined,
    flex: 1,
    alignSelf: 'stretch',
    textAlignVertical: 'top',
  },
  saveButton: {
    width: '100%',
    marginTop: Spacing.two,
  },
  availableText: {
    color: Brand.sticker.green,
    fontSize: 12,
    marginTop: 2,
  },
  // Transient "Saved ✓" badge in the edit header.
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  savedBadgeText: {
    fontSize: 13,
  },

  // ---- Full-screen photo viewer ----
  viewerRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerPage: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  viewerCloseWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  viewerCloseButton: {
    margin: Spacing.three,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewerCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerCaptionName: {
    fontSize: 18,
  },
  viewerCaptionDate: {
    fontSize: 14,
    opacity: 0.85,
    marginTop: 2,
  },
  viewerCounter: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
});
