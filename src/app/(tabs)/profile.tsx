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
  Share,
  Linking,
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
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandText } from '@/components/brand';
import { ConfirmModal } from '@/components/confirm-modal';
import { DateOfBirthInput, DateParts, partsToIsoDate } from '@/components/dob-input';
import { Brand, BrandFonts, BrandRadius, stampBorder, Spacing } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { changeBaseLocation, checkUsernameAvailable, deleteAccount, deleteCheckInNow, shareCheckIn, signOut, UsernameStatus } from '@/utils/account';
import { fetchSuburbs, SuburbSuggestion } from '@/utils/places';
import {
  enableNearbyAlerts,
  disableNearbyAlerts,
  getNearbyAlertsStatus,
  type NearbyAlertsStatus,
} from '@/utils/geofencing';
import { NEARBY_ALERTS_BONUS_PCT, deriveLevelStats } from '@/utils/leveling';
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

// Backend age gate: Locatour is 13+. Mirrors auth/customize.tsx so editing your
// DOB applies the same instant client-side check as onboarding did.
const MIN_AGE = 13;
const AGE_GATE_MESSAGE = 'Locatour is currently available for users aged 13 and above.';
// kv key the DOB is persisted under client-side. There is NO User.dateOfBirth
// field and NO backend DOB-update endpoint yet (registerAccount sends it once at
// onboarding; sync/updateProfile don't), so an edited DOB is stored locally only.
// See the report — a backend endpoint is still needed to round-trip this change.
const DOB_STORAGE_KEY = 'locatour_dob';

/** Whole years between an ISO birth date and today (lifted from auth/customize). */
function ageInYears(isoDate: string): number {
  const dob = new Date(isoDate);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

/** Split a stored ISO `YYYY-MM-DD` back into the DateParts the picker expects. */
function isoToParts(iso: string | null): DateParts {
  if (!iso) return { day: '', month: '', year: '' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { day: '', month: '', year: '' };
  return { year: m[1], month: m[2], day: m[3] };
}

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
  onDelete,
  onShare,
}: {
  photos: ViewerPhoto[];
  initialIndex: number;
  onClose: () => void;
  /** Delete the check-in for the photo currently on screen (by its index). */
  onDelete: (index: number) => void;
  /** Share the check-in for the photo currently on screen (by its index). */
  onShare: (index: number) => void;
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

        {/* Share the check-in shown on screen (bottom-left). */}
        <SafeAreaView style={styles.viewerShareWrap} edges={['bottom']}>
          <TouchableOpacity
            style={styles.viewerShareButton}
            onPress={() => onShare(index)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="share-outline" size={22} color={Brand.surface} />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Delete the check-in shown on screen (bottom-right). */}
        <SafeAreaView style={styles.viewerDeleteWrap} edges={['bottom']}>
          <TouchableOpacity
            style={styles.viewerDeleteButton}
            onPress={() => onDelete(index)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="trash" size={22} color={Brand.surface} />
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

// Dot colour + label for the Nearby-alerts true-state indicator. GREEN = really
// active; AMBER = opted in but the OS isn't permitting it; neutral grey = off.
const ALERTS_STATUS_META: Record<NearbyAlertsStatus, { color: string; label: string }> = {
  on: { color: Brand.sticker.green, label: 'Active' },
  'needs-permission': { color: '#E0922F', label: 'Needs permission' },
  off: { color: Brand.inkSubtle, label: 'Off' },
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<User | null>(null);
  // Background "Nearby alerts" opt-in (off by default). Initialised synchronously
  // from storage so the switch reflects the saved preference on first paint.
  const [nearbyAlerts, setNearbyAlerts] = useState(() => storage.getNearbyAlertsEnabled());
  // The TRUE state of Nearby Alerts (stored toggle + real OS permissions), so the
  // card's indicator never claims "Active" when the OS won't deliver a ping. Seeded
  // 'off'/'on' from the stored flag and reconciled against the OS on focus below.
  const [alertsStatus, setAlertsStatus] = useState<NearbyAlertsStatus>(() =>
    storage.getNearbyAlertsEnabled() ? 'on' : 'off',
  );
  // Branded confirm/info dialogs that replace the native Alert.alert popups.
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [alertsConfirm, setAlertsConfirm] = useState(false);
  const [alertsPermInfo, setAlertsPermInfo] = useState(false);
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
  // The achievement whose detail sheet is open (tap a card), or null.
  const [selectedAch, setSelectedAch] = useState<Achievement | null>(null);

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

  // ── Base-location edit state (suburb autocomplete, mirrors auth/customize) ──
  // The base location changes through the SERVER's cooldown-guarded endpoint
  // (changeBaseLocation), NOT the auto-save above — so it has its own explicit
  // "Update" action and its own success/cooldown messaging.
  const [editSuburbQuery, setEditSuburbQuery] = useState('');
  const [editSelectedSuburb, setEditSelectedSuburb] = useState('');
  const [editSelectedPlaceId, setEditSelectedPlaceId] = useState('');
  const [showEditSuburbs, setShowEditSuburbs] = useState(false);
  const [editSuburbSuggestions, setEditSuburbSuggestions] = useState<SuburbSuggestion[]>([]);
  const [editSuburbLoading, setEditSuburbLoading] = useState(false);
  const [savingBase, setSavingBase] = useState(false);
  // Inline status under the suburb field: success confirmation or the
  // cooldown/offline/error explanation surfaced from changeBaseLocation.
  const [baseLocationMsg, setBaseLocationMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const editSuburbReqId = useRef(0);

  // ── Date-of-birth edit state ──
  // Persisted client-side only (DOB_STORAGE_KEY) — there is no backend update
  // endpoint yet (see report). Seeded from the kv store when entering edit mode.
  const [editDob, setEditDob] = useState<DateParts>({ day: '', month: '', year: '' });
  const [dobError, setDobError] = useState('');
  const [dobSaved, setDobSaved] = useState(false);

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

      // Recent check-ins. Every check-in lives in this.checkIns (the camera adds
      // it locally on BOTH the online and offline paths); the offline upload queue
      // is just a retry list for the SAME records. So we list checkIns ONLY —
      // pulling the queue in too showed each un-synced check-in twice (one normal,
      // one "pending sync"). pendingSync is derived from the missing serverId.
      const checkIns = await storage.getCheckIns();
      const combined: HistoryEntry[] = checkIns.map((c) => ({
        checkIn: c,
        pendingSync: !c.serverId,
        location: undefined,
      }));
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

  // ── Reconcile Nearby Alerts against the real OS permissions ────────────────
  // The stored toggle can DRIFT from the OS: the user can revoke "Allow all the
  // time" location (or notifications) in Settings while our flag still reads on,
  // leaving geofencing silently dead. So on every focus (and after any toggle) we
  // read the true state and, if the toggle says on but the OS no longer permits
  // it, flip the stored flag off — the indicator then shows the honest state
  // ('needs-permission') and the switch returns to off rather than lying.
  const refreshAlertsStatus = useCallback(async () => {
    const status = await getNearbyAlertsStatus();
    setAlertsStatus(status);
    // Keep the switch in sync with the stored flag (getNearbyAlertsStatus may have
    // been reconciled elsewhere, e.g. refreshGeofencesOnFocus flipping it off).
    setNearbyAlerts(storage.getNearbyAlertsEnabled());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshAlertsStatus();
    }, [refreshAlertsStatus]),
  );

  // ── Live username availability check (debounced ~400ms) ───────────────────
  // Mirrors the onboarding screen. Pass user.uid as device_id so the user's OWN
  // current username reads as available, not "taken". Sits ABOVE the early
  // returns to preserve hook order.
  //
  // Depend on the two PRIMITIVE values this effect reads (uid + current handle),
  // NOT the whole `user` object: the auto-save effect calls setUser() with a
  // fresh object on every save, and depending on that reference re-ran this
  // check, which re-set usernameStatus, which re-triggered auto-save → setUser →
  // an infinite "checking ⇄ taken" loop (spinner spinning, message flashing).
  const userUid = user?.uid;
  const currentHandle = user
    ? (user.username.startsWith('@') ? user.username.slice(1) : user.username)
    : '';
  useEffect(() => {
    if (!isEditing || !userUid) return;
    const u = editUsername.trim();
    // No feedback when the handle is unchanged from the user's current one —
    // they haven't made a change, so don't flash "that one's free".
    if (u.toLowerCase() === currentHandle.toLowerCase()) {
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
      const status = await checkUsernameAvailable(u, userUid);
      if (reqId !== usernameReqId.current) return; // a newer keystroke won
      setUsernameStatus(status);
    }, 400);
    return () => clearTimeout(handle);
  }, [editUsername, isEditing, userUid, currentHandle]);

  // ── Live suburb autocomplete for the base-location field (debounced ~320ms) ─
  // Mirrors auth/customize.tsx. Only runs in edit mode; the last query wins, and
  // we don't re-search the exact value the user just picked. Sits ABOVE the early
  // returns to preserve hook order.
  useEffect(() => {
    if (!isEditing) return;
    const q = editSuburbQuery.trim();
    if (!q || q === editSelectedSuburb) {
      setEditSuburbSuggestions([]);
      setEditSuburbLoading(false);
      return;
    }
    setEditSuburbLoading(true);
    const reqId = ++editSuburbReqId.current;
    const handle = setTimeout(async () => {
      const results = await fetchSuburbs(q);
      if (reqId !== editSuburbReqId.current) return; // a newer keystroke won
      setEditSuburbSuggestions(results);
      setEditSuburbLoading(false);
    }, 320);
    return () => clearTimeout(handle);
  }, [editSuburbQuery, editSelectedSuburb, isEditing]);

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
    // Seed the base-location field from the saved home suburb (no placeId yet —
    // re-picking from the autocomplete supplies one for a precise geocode).
    setEditSuburbQuery(user.homeSuburb || '');
    setEditSelectedSuburb(user.homeSuburb || '');
    setEditSelectedPlaceId('');
    setShowEditSuburbs(false);
    setEditSuburbSuggestions([]);
    setBaseLocationMsg(null);
    setSavingBase(false);
    // Seed DOB from the client-side kv store (no User field / endpoint yet).
    setEditDob(isoToParts(storage.getItem(DOB_STORAGE_KEY)));
    setDobError('');
    setDobSaved(false);
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
    setShowEditSuburbs(false);
    setBaseLocationMsg(null);
    setDobError('');
    setDobSaved(false);
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

  // Pick a suburb suggestion → fill the field + remember its placeId for a
  // precise geocode when the user taps "Update".
  const handleEditSuburbSelect = (suburb: string, placeId?: string) => {
    setEditSelectedSuburb(suburb);
    setEditSelectedPlaceId(placeId ?? '');
    setEditSuburbQuery(suburb);
    setShowEditSuburbs(false);
    setEditSuburbSuggestions([]);
    setBaseLocationMsg(null);
  };

  // Commit a base-location change through the SERVER's cooldown-guarded endpoint
  // (the only path allowed to move it after onboarding). Surfaces the cooldown /
  // offline / blocked / error result inline rather than silently failing. On
  // success the local user already mirrors the change (changeBaseLocation does
  // it), so we refresh from storage to repaint the view-mode suburb.
  const handleSaveBaseLocation = async () => {
    const suburb = (editSelectedSuburb || editSuburbQuery).trim();
    if (!suburb) {
      setBaseLocationMsg({ kind: 'error', text: 'Please enter your home suburb.' });
      return;
    }
    if (suburb === (user?.homeSuburb || '').trim() && !editSelectedPlaceId) {
      setBaseLocationMsg({ kind: 'error', text: "That's already your base location." });
      return;
    }
    setSavingBase(true);
    setBaseLocationMsg(null);
    const result = await changeBaseLocation(suburb, editSelectedPlaceId || undefined);
    setSavingBase(false);

    if (result.ok) {
      setEditSelectedSuburb(suburb);
      setEditSelectedPlaceId('');
      const fresh = await storage.getUser();
      if (fresh) setUser(fresh);
      setBaseLocationMsg({ kind: 'ok', text: 'Base location updated.' });
      return;
    }
    // Map each failure reason to a clear, branded explanation.
    if (result.reason === 'cooldown') {
      const when = result.nextChangeAt ? new Date(result.nextChangeAt) : null;
      const whenText =
        when && !Number.isNaN(when.getTime()) ? ` You can change it again ${formatDate(when.toISOString())}.` : '';
      setBaseLocationMsg({
        kind: 'error',
        text: `You've changed your base location recently.${whenText}`,
      });
    } else if (result.reason === 'offline') {
      setBaseLocationMsg({ kind: 'error', text: 'Could not reach the server — check your connection and try again.' });
    } else if (result.reason === 'blocked') {
      setBaseLocationMsg({ kind: 'error', text: 'Your account is blocked, so this change was rejected.' });
    } else {
      setBaseLocationMsg({ kind: 'error', text: "Couldn't update your base location — please try again." });
    }
  };

  // Persist an edited date of birth. There is NO backend DOB-update endpoint yet
  // (registerAccount only sends it once at onboarding), so this validates with the
  // SAME 13+ age gate as onboarding and stores the ISO value client-side via the
  // kv passthrough. See the report: a backend endpoint is still needed.
  const handleSaveDob = () => {
    const iso = partsToIsoDate(editDob);
    if (!iso) {
      setDobSaved(false);
      setDobError('Please enter a valid date of birth.');
      return;
    }
    if (ageInYears(iso) < MIN_AGE) {
      setDobSaved(false);
      setDobError(AGE_GATE_MESSAGE);
      return;
    }
    storage.setItem(DOB_STORAGE_KEY, iso);
    setDobError('');
    setDobSaved(true);
  };

  // Toggle background Nearby Alerts. Turning ON shows the required prominent
  // disclosure BEFORE the OS permission request (Google Play background-location
  // policy); turning OFF stops monitoring immediately.
  const handleToggleAlerts = (value: boolean) => {
    if (!value) {
      setNearbyAlerts(false);
      setAlertsStatus('off');
      void disableNearbyAlerts();
      return;
    }
    setAlertsConfirm(true);
  };

  // Confirmed the disclosure → request permission + enable. On failure (the OS
  // didn't grant "Allow all the time" — often because it was permanently denied
  // and can no longer be prompted in-app) surface the branded settings explainer,
  // whose action deep-links to Settings so they can grant it manually.
  const doEnableAlerts = async () => {
    setAlertsConfirm(false);
    const ok = await enableNearbyAlerts();
    // Re-derive the honest status (covers the case where background was granted
    // but notifications weren't — 'needs-permission', not a flat on/off).
    await refreshAlertsStatus();
    if (!ok) setAlertsPermInfo(true);
  };

  // Send the user to the OS app settings to grant "Allow all the time" location
  // (and notifications) manually when it can't be requested in-app. The focus
  // effect re-checks the true status when they return.
  const openAppSettings = () => {
    setAlertsPermInfo(false);
    void Linking.openSettings();
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

  const handleLogout = () => setLogoutConfirm(true);

  const doLogout = async () => {
    setLogoutConfirm(false);
    // Full sign-out (wipe local data + end the Google session), not just clearing
    // the user — otherwise the next account on this device would inherit this one's
    // local check-ins/achievements. Matches the gear-screen "Sign out".
    await signOut();
    router.replace('/auth/login');
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

  // The overview totals reflect the SAME lifetime check-in list the user sees in
  // the timeline below (synced history + the offline upload queue). We derive
  // level & progress from that points total rather than the cached stats.totalXP,
  // which lags when check-ins are still queued (their points count toward the
  // visible total but haven't been folded into totalXP yet) — that's why a
  // 250-point explorer was wrongly showing "Level 1, 0/83" with an empty bar.
  const cumulativePoints = entries.reduce(
    (sum, entry) => sum + (entry.checkIn.pointsEarned || 0),
    0,
  );
  // Reconcile with the server-synced total: stats.totalXP can hold XP that isn't
  // stored as check-ins (admin grants, achievement XP), while cumulativePoints
  // leads when check-ins are still queued. The higher of the two is the truth, so
  // this matches what home / the tab badge show (they read stats.currentLevel).
  const effectiveXP = Math.max(stats.totalXP || 0, cumulativePoints);
  const pointLevel = deriveLevelStats(effectiveXP);
  const totalCheckInsCount = entries.length;
  const uniqueLocationsCount = new Set(entries.map((e) => e.checkIn.locationId)).size;
  const xpProgress =
    pointLevel.xpNeededForNextLevel > 0
      ? Math.min(pointLevel.currentXPInLevel / pointLevel.xpNeededForNextLevel, 1)
      : 0;
  // A human "how close am I" hint under the bar. Estimate check-ins-to-go from
  // the explorer's own average points per check-in; fall back to raw XP if they
  // have no check-ins yet to average from.
  const pointsToNext = Math.max(0, pointLevel.xpNeededForNextLevel - pointLevel.currentXPInLevel);
  const avgPerCheckIn = totalCheckInsCount > 0 ? cumulativePoints / totalCheckInsCount : 0;
  const checkInsToGo =
    avgPerCheckIn > 0 && pointsToNext > 0 ? Math.max(1, Math.ceil(pointsToNext / avgPerCheckIn)) : null;
  const levelHint =
    checkInsToGo != null
      ? `~${checkInsToGo} check-in${checkInsToGo === 1 ? '' : 's'} to level ${pointLevel.currentLevel + 1}`
      : pointsToNext > 0
        ? `${pointLevel.currentXPInLevel} / ${pointLevel.xpNeededForNextLevel} XP to level ${pointLevel.currentLevel + 1}`
        : `Level ${pointLevel.currentLevel} reached`;

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

  const openViewer = (index: number) => setViewerIndex(index);

  // Share the opened check-in: mint its public link on the server, then open the
  // native share sheet (copy-link included). Only synced check-ins have a server
  // id — a still-uploading one is queued, so we ask the user to retry shortly.
  const handleShareCheckIn = async (index: number) => {
    const entry = entries[index];
    const serverId = entry?.checkIn.serverId;
    if (!serverId) {
      Alert.alert('Still uploading', 'This check-in is still syncing — try sharing again in a moment.');
      return;
    }
    const url = await shareCheckIn(serverId);
    if (!url) {
      Alert.alert("Couldn't create link", 'Please check your connection and try again.');
      return;
    }
    try {
      // message carries the URL so Android (which ignores `url`) still shares it.
      await Share.share({ message: url, url });
    } catch {
      // user dismissed the share sheet — ignore
    }
  };

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

          {/* Base location — moved through the server's cooldown-guarded endpoint
              (changeBaseLocation), NOT the auto-save, so it has an explicit
              "Update" action and its own success/cooldown messaging. The
              autocomplete dropdown must overlay the field below it. */}
          <View style={[styles.fieldGroup, styles.baseLocationGroup]}>
            <BrandText weight="medium" style={styles.label}>Base location</BrandText>
            <View style={styles.suburbContainer}>
              <View style={[styles.inputRow, stampBorder]}>
                <Ionicons name="search-outline" size={18} color={Brand.inkSubtle} />
                <TextInput
                  style={styles.inputField}
                  placeholder="Home suburb"
                  placeholderTextColor={Brand.inkSubtle}
                  value={editSuburbQuery}
                  onChangeText={(text) => {
                    setEditSuburbQuery(text);
                    setShowEditSuburbs(true);
                    setBaseLocationMsg(null);
                    if (editSelectedSuburb && text !== editSelectedSuburb) {
                      setEditSelectedSuburb('');
                      setEditSelectedPlaceId('');
                    }
                  }}
                  onFocus={() => setShowEditSuburbs(true)}
                  autoCorrect={false}
                />
              </View>

              {showEditSuburbs &&
                editSuburbQuery.trim().length >= 2 &&
                editSuburbQuery.trim() !== editSelectedSuburb && (
                  <View style={[styles.suburbDropdown, stampBorder]}>
                    {editSuburbLoading ? (
                      <View style={styles.dropdownItem}>
                        <ActivityIndicator size="small" color={Brand.purple} />
                        <BrandText weight="medium" color={Brand.inkSubtle} style={styles.dropdownItemText}>
                          Searching…
                        </BrandText>
                      </View>
                    ) : editSuburbSuggestions.length > 0 ? (
                      editSuburbSuggestions.map((s, i) => (
                        <TouchableOpacity
                          key={s.placeId ?? s.description}
                          style={[
                            styles.dropdownItem,
                            i !== editSuburbSuggestions.length - 1 && styles.dropdownItemBorder,
                          ]}
                          onPress={() => handleEditSuburbSelect(s.description, s.placeId)}
                        >
                          <Ionicons name="location-outline" size={16} color={Brand.purple} />
                          <BrandText weight="medium" style={styles.dropdownItemText}>
                            {s.description}
                          </BrandText>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <View style={styles.dropdownItem}>
                        <Ionicons name="information-circle-outline" size={16} color={Brand.inkSubtle} />
                        <BrandText weight="medium" color={Brand.inkSubtle} style={styles.dropdownItemText}>
                          No matches — we&apos;ll use what you typed
                        </BrandText>
                      </View>
                    )}
                  </View>
                )}
            </View>

            <TouchableOpacity
              style={[styles.baseUpdateBtn, stampBorder, savingBase && styles.baseUpdateBtnDisabled]}
              activeOpacity={0.85}
              disabled={savingBase}
              onPress={handleSaveBaseLocation}
            >
              {savingBase ? (
                <ActivityIndicator size="small" color={Brand.bg} />
              ) : (
                <BrandText weight="bold" color={Brand.bg} style={styles.baseUpdateText}>
                  Update base location
                </BrandText>
              )}
            </TouchableOpacity>
            {baseLocationMsg ? (
              <BrandText
                weight="medium"
                style={baseLocationMsg.kind === 'ok' ? styles.availableText : styles.errorText}
              >
                {baseLocationMsg.text}
              </BrandText>
            ) : (
              <BrandText weight="medium" color={Brand.inkSubtle} style={styles.baseHint}>
                Changing your base location is rate-limited.
              </BrandText>
            )}
          </View>

          {/* Date of birth — same 13+ age gate as onboarding. Persisted
              client-side only for now (no backend DOB-update endpoint yet). */}
          <View style={styles.fieldGroup}>
            <BrandText weight="medium" style={styles.label}>Date of birth</BrandText>
            <DateOfBirthInput
              value={editDob}
              onChange={(next) => {
                setEditDob(next);
                if (dobError) setDobError('');
                if (dobSaved) setDobSaved(false);
              }}
            />
            <TouchableOpacity
              style={[styles.baseUpdateBtn, stampBorder]}
              activeOpacity={0.85}
              onPress={handleSaveDob}
            >
              <BrandText weight="bold" color={Brand.bg} style={styles.baseUpdateText}>
                Update date of birth
              </BrandText>
            </TouchableOpacity>
            {dobError ? (
              <BrandText weight="medium" style={styles.errorText}>{dobError}</BrandText>
            ) : dobSaved ? (
              <BrandText weight="medium" style={styles.availableText}>Date of birth saved.</BrandText>
            ) : null}
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

          {/* Sign out / disconnect — ends the Google session and returns to login.
              Local data stays on the device and re-syncs on the next sign-in. */}
          <TouchableOpacity
            style={[styles.signOutBtn, stampBorder]}
            activeOpacity={0.85}
            onPress={() =>
              Alert.alert('Sign out?', 'You can sign back in with Google any time.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign out',
                  style: 'destructive',
                  onPress: async () => {
                    await signOut();
                    router.replace('/auth/login');
                  },
                },
              ])
            }
          >
            <Ionicons name="log-out-outline" size={18} color={Brand.ink} />
            <BrandText weight="bold" color={Brand.ink} style={styles.signOutText}>
              Sign out
            </BrandText>
          </TouchableOpacity>

          {/* Destructive: permanently delete the account + ALL data (server + local),
              then drop back into onboarding as a brand-new user. */}
          <TouchableOpacity
            style={styles.deleteBtn}
            activeOpacity={0.85}
            onPress={() =>
              Alert.alert(
                'Delete account?',
                'This permanently deletes your account and ALL your data — check-ins, achievements and unlocked spots. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete everything',
                    style: 'destructive',
                    onPress: async () => {
                      await deleteAccount();
                      // Login is the first screen now; signing in fresh routes a new
                      // user through the onboarding story.
                      router.replace('/auth/login');
                    },
                  },
                ],
              )
            }
          >
            <Ionicons name="trash-outline" size={18} color="#d1453b" />
            <BrandText weight="bold" style={styles.deleteText}>Delete account</BrandText>
          </TouchableOpacity>

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
                {pointLevel.currentLevel}
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
                    {pointLevel.currentLevel}
                  </BrandText>
                </View>
                <View style={styles.progressBarBackground}>
                  {/* Min 4% so there's always a sliver of fill on the left. */}
                  <View style={[styles.progressBarActive, { width: `${Math.max(xpProgress * 100, 4)}%` }]} />
                </View>
                <View style={[styles.levelBadge, styles.roundedFull, { backgroundColor: Brand.purple }]}>
                  <BrandText weight="bold" color={Brand.bg} style={styles.levelBadgeText}>
                    {pointLevel.currentLevel + 1}
                  </BrandText>
                </View>
              </View>
              <BrandText weight="medium" style={styles.xpHint}>
                {levelHint}
              </BrandText>
            </View>

            {/* Stats grid 2x2 */}
            <View style={styles.statsGrid}>
              <StatCard icon="flame" color={Brand.sticker.pink} value={stats.dayStreak} label="Day streak" />
              <StatCard icon="flash" color={Brand.sticker.gold} value={cumulativePoints} label="Total XP" />
              <StatCard icon="location" color={Brand.purple} value={uniqueLocationsCount} label="Unique locations" />
              <StatCard icon="map" color={Brand.sticker.green} value={totalCheckInsCount} label="Total check-ins" />
            </View>

            {/* Nearby alerts opt-in — incentivised with a points multiplier. The
                status pill reflects the TRUE state (toggle + real OS permissions),
                so it never claims "Active" when the OS won't deliver a ping. */}
            <View style={[styles.alertsCard, stampBorder]}>
              <View style={styles.alertsInfo}>
                <View style={styles.alertsTitleRow}>
                  <Ionicons name="notifications" size={16} color={Brand.purple} />
                  <BrandText weight="semibold" style={styles.blockTitle}>Nearby alerts</BrandText>
                  <View style={styles.alertsBonusPill}>
                    <BrandText weight="bold" color={Brand.bg} style={styles.alertsBonusText}>+{NEARBY_ALERTS_BONUS_PCT}% pts</BrandText>
                  </View>
                </View>
                {/* Honest red/green/neutral status indicator. */}
                <View style={styles.alertsStatusRow}>
                  <View style={[styles.alertsStatusDot, { backgroundColor: ALERTS_STATUS_META[alertsStatus].color }]} />
                  <BrandText
                    weight="semibold"
                    color={ALERTS_STATUS_META[alertsStatus].color}
                    style={styles.alertsStatusText}
                  >
                    {ALERTS_STATUS_META[alertsStatus].label}
                  </BrandText>
                </View>
                <BrandText weight="medium" color={Brand.inkSecondary} style={styles.alertsSubtitle}>
                  Get pinged when you wander near a hidden spot — and earn +{NEARBY_ALERTS_BONUS_PCT}% points on every check-in.
                </BrandText>
                {/* Toggle reads on but the OS isn't permitting it → direct them to fix it. */}
                {alertsStatus === 'needs-permission' ? (
                  <TouchableOpacity
                    style={styles.alertsFixRow}
                    activeOpacity={0.7}
                    onPress={() => setAlertsPermInfo(true)}
                  >
                    <Ionicons name="warning" size={13} color={ALERTS_STATUS_META['needs-permission'].color} />
                    <BrandText weight="semibold" color={Brand.purple} style={styles.alertsFixText}>
                      Location permission needed — tap to fix
                    </BrandText>
                  </TouchableOpacity>
                ) : null}
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
                <View style={styles.galleryGrid}>
                  {entries.map((entry, idx) => (
                    <TouchableOpacity
                      key={entry.checkIn.id}
                      activeOpacity={0.85}
                      style={[styles.galleryItem, stampBorder]}
                      onPress={() => openViewer(idx)}
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
                  <TouchableOpacity
                    key={ach.id}
                    activeOpacity={0.85}
                    onPress={() => setSelectedAch(ach)}
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
                    {ach.isUnlocked ? (
                      <View style={styles.achDoneBadge}>
                        <Ionicons name="checkmark" size={13} color={Brand.bg} />
                      </View>
                    ) : (
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
                  </TouchableOpacity>
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
          // viewerPhotos is 1:1 with entries (same order), so the on-screen index
          // maps straight to the entry to delete. Routes through the existing
          // confirm flow (which closes the viewer + reloads on success).
          onDelete={(i) => {
            const entry = entries[i];
            if (entry) setPendingDelete(entry);
          }}
          onShare={(i) => {
            void handleShareCheckIn(i);
          }}
        />
      ) : null}

      {/* Achievement detail — how you earned it (unlocked) or how to earn it. */}
      <Modal
        visible={selectedAch !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAch(null)}
      >
        <TouchableOpacity
          style={styles.confirmOverlay}
          activeOpacity={1}
          onPress={() => setSelectedAch(null)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.achModalCard, stampBorder]} onPress={() => {}}>
            {selectedAch ? (
              <>
                <View
                  style={[
                    styles.achModalIcon,
                    { borderColor: DIFFICULTY_COLOR[selectedAch.difficulty] ?? Brand.teal },
                  ]}
                >
                  <Ionicons
                    name={selectedAch.iconName as keyof typeof Ionicons.glyphMap}
                    size={34}
                    color={DIFFICULTY_COLOR[selectedAch.difficulty] ?? Brand.teal}
                  />
                </View>
                <BrandText weight="bold" style={styles.achModalTitle}>
                  {selectedAch.title}
                </BrandText>
                <View
                  style={[
                    styles.difficultyChip,
                    { backgroundColor: DIFFICULTY_COLOR[selectedAch.difficulty] ?? Brand.teal },
                  ]}
                >
                  <BrandText weight="bold" color={Brand.bg} style={styles.difficultyChipText}>
                    {selectedAch.difficulty}
                  </BrandText>
                </View>

                <View style={styles.achModalStatus}>
                  <Ionicons
                    name={selectedAch.isUnlocked ? 'checkmark-circle' : 'lock-closed'}
                    size={15}
                    color={selectedAch.isUnlocked ? Brand.sticker.green : Brand.inkSecondary}
                  />
                  <BrandText
                    weight="bold"
                    color={selectedAch.isUnlocked ? Brand.sticker.green : Brand.inkSecondary}
                    style={styles.achModalStatusText}
                  >
                    {selectedAch.isUnlocked
                      ? selectedAch.unlockedAt
                        ? `Earned ${formatDate(selectedAch.unlockedAt)}`
                        : 'Earned'
                      : 'Not earned yet'}
                  </BrandText>
                </View>

                <View style={styles.achModalSection}>
                  <BrandText weight="bold" color={Brand.inkSecondary} style={styles.achModalLabel}>
                    {selectedAch.isUnlocked ? 'HOW YOU EARNED IT' : 'HOW TO EARN'}
                  </BrandText>
                  <BrandText weight="medium" style={styles.achModalBody}>
                    {selectedAch.description}
                  </BrandText>
                </View>

                <View style={styles.achModalReward}>
                  <Ionicons name="trophy" size={15} color={Brand.sticker.gold} />
                  <BrandText weight="bold" color={Brand.ink} style={styles.achModalRewardText}>
                    {`+${selectedAch.points} points`}
                  </BrandText>
                </View>

                <TouchableOpacity
                  style={styles.achModalClose}
                  onPress={() => setSelectedAch(null)}
                  activeOpacity={0.85}
                >
                  <BrandText weight="bold" color={Brand.surface} style={styles.achModalCloseText}>
                    Got it
                  </BrandText>
                </TouchableOpacity>
              </>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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

      {/* Branded confirmations (replace the native Alert.alert popups). */}
      <ConfirmModal
        visible={logoutConfirm}
        title="Log out"
        body="Are you sure you want to log out?"
        confirmLabel="Log out"
        cancelLabel="Cancel"
        destructive
        onConfirm={doLogout}
        onCancel={() => setLogoutConfirm(false)}
      />
      <ConfirmModal
        visible={alertsConfirm}
        title="Turn on Nearby Alerts?"
        body="Locatour will use your location in the background — even when the app is closed — to notify you when you wander near a hidden spot, so you discover places as you go about your day."
        bullets={[
          `You earn +${NEARBY_ALERTS_BONUS_PCT}% points on every check-in while it's on.`,
          'It only checks your location against nearby spots (battery-light) — never tracked or shared.',
          'Turn it off anytime here.',
        ]}
        confirmLabel="Turn on"
        cancelLabel="Not now"
        onConfirm={doEnableAlerts}
        onCancel={() => setAlertsConfirm(false)}
      />
      <ConfirmModal
        visible={alertsPermInfo}
        title={'Allow location “All the time”'}
        body={'To get nearby alerts, Locatour needs location set to “Allow all the time” (and notifications enabled) in your phone’s Settings. Open Settings to grant it — we’ll re-check when you come back.'}
        confirmLabel="Open Settings"
        cancelLabel="Not now"
        onConfirm={openAppSettings}
        onCancel={() => setAlertsPermInfo(false)}
      />
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
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: BrandRadius.control,
    backgroundColor: Brand.surface,
    marginTop: Spacing.five,
  },
  signOutText: {
    fontSize: 15,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: BrandRadius.control,
    borderWidth: 1.5,
    borderColor: '#d1453b',
    marginTop: Spacing.three,
  },
  deleteText: {
    fontSize: 15,
    color: '#d1453b',
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
    lineHeight: 18,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
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
  alertsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
  },
  alertsStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  alertsStatusText: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  alertsFixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    marginTop: 2,
  },
  alertsFixText: {
    fontSize: 12,
    textDecorationLine: 'underline',
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
    lineHeight: 22,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  progressBarBackground: {
    flex: 1,
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
  xpHint: {
    fontSize: 12,
    color: Brand.inkSecondary,
    marginTop: 8,
    alignSelf: 'flex-start',
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
  // Green "completed" tick on unlocked achievements.
  achDoneBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Brand.sticker.green,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  // Achievement detail modal.
  achModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Brand.surface,
    borderRadius: BrandRadius.sticker,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  achModalIcon: {
    width: 64,
    height: 64,
    borderRadius: BrandRadius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.bg,
  },
  achModalTitle: {
    fontSize: 18,
    color: Brand.ink,
    textAlign: 'center',
  },
  achModalStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  achModalStatusText: {
    fontSize: 12,
  },
  achModalSection: {
    width: '100%',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  achModalLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  achModalBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Brand.ink,
  },
  achModalReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.two,
    backgroundColor: 'rgba(245,166,35,0.16)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: BrandRadius.pill,
  },
  achModalRewardText: {
    fontSize: 13,
  },
  achModalClose: {
    marginTop: Spacing.three,
    alignSelf: 'stretch',
    backgroundColor: Brand.ink,
    borderRadius: BrandRadius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  achModalCloseText: {
    fontSize: 15,
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

  // ---- Base-location editor (suburb autocomplete + Update) ----
  // Needs a high zIndex so the absolute dropdown overlays the DOB field below it
  // (mirrors the suburbField fix in auth/customize.tsx).
  baseLocationGroup: {
    position: 'relative',
    zIndex: 20,
  },
  suburbContainer: {
    position: 'relative',
    zIndex: 50,
  },
  suburbDropdown: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: Brand.surface,
    zIndex: 200,
    shadowColor: Brand.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: `rgba(42,36,33,0.1)`,
  },
  dropdownItemText: {
    fontSize: 14,
    color: Brand.ink,
  },
  baseUpdateBtn: {
    height: 44,
    marginTop: Spacing.two,
    borderRadius: BrandRadius.control,
    backgroundColor: Brand.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseUpdateBtnDisabled: {
    opacity: 0.6,
  },
  baseUpdateText: {
    fontSize: 14,
  },
  baseHint: {
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
  viewerDeleteWrap: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  viewerDeleteButton: {
    margin: Spacing.three,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(209,69,59,0.9)', // destructive red
  },
  viewerShareWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  viewerShareButton: {
    margin: Spacing.three,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
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
