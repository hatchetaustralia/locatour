import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Dimensions,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import { File, Directory, Paths } from 'expo-file-system';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandText } from '@/components/brand';
import { Brand, BrandFonts, BrandRadius, stampBorder, Spacing } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { uploadCheckInNow, uploadPendingCheckIns } from '@/utils/account';
import {
  unlockedTier,
  maxDiscoverableTier,
  DISCOVERY_MULTIPLIER,
  WARM_RADIUS_M,
  LOCK_TEASER_RANGE,
  levelForTier,
} from '@/utils/leveling';
import { formatDistance } from '@/utils/geo';
import { ExploreLocation, CheckIn, User, Coordinates, Achievement } from '@/types';

// --- Tuning flags ---
// Real-world proximity FLOOR for a valid check-in. A location's own
// geofenceRadius is used when larger; this is the minimum tolerance.
const CHECK_IN_RADIUS_M = 50;
// Fallback geofence radius (metres) for locations that don't define their own.
const DEFAULT_GEOFENCE_RADIUS_M = 150;
// Mock verification duration (later this becomes a real server call).
const VERIFY_DURATION_MS = 1800;

// The effective check-in radius for a location: its own geofence (when present),
// floored at CHECK_IN_RADIUS_M so the tolerance is never unreasonably tight.
const effectiveRadius = (loc: ExploreLocation) =>
  Math.max(CHECK_IN_RADIUS_M, loc.geofenceRadius ?? DEFAULT_GEOFENCE_RADIUS_M);

// Copy a freshly-captured photo out of the (clearable) cache directory into the
// permanent document directory so the local thumbnail + the upload-retry both
// survive an app restart. Returns the new file:// uri, or the original uri on
// any failure / on web (where there's no native FS to copy into). Fail-soft:
// a permanence failure must never break the check-in flow.
function persistPhoto(cacheUri: string): string {
  if (Platform.OS === 'web') return cacheUri;
  try {
    const dir = new Directory(Paths.document, 'checkins');
    dir.create({ intermediates: true, idempotent: true });
    const ext = cacheUri.split('.').pop()?.split('?')[0] || 'jpg';
    const name = `checkin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const src = new File(cacheUri);
    const dest = new File(dir, name);
    src.copy(dest);
    return dest.uri;
  } catch (e) {
    console.warn('Failed to persist photo to document dir, keeping cache uri', e);
    return cacheUri;
  }
}

// On web the tab bar floats (position: absolute) over screen content; on native
// NativeTabs reserves that space. Lift the camera's bottom controls above it on web.
const WEB_TABBAR_CLEARANCE = Platform.OS === 'web' ? 96 : 0;

// State machine for the check-in flow.
type FlowState = 'capture' | 'preview' | 'verifying' | 'verified' | 'toofar' | 'locked' | 'error';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

// Cream success sheet palette (aligned to Brand tokens / Figma node 340:1618).
const CREAM = Brand.bg; // #FCF0E8
const DARK_BROWN = Brand.ink; // #2A2421
const DARK_BROWN_SECONDARY = Brand.inkSecondary; // #625650
const HAIRLINE = 'rgba(42,36,33,0.1)'; // section dividers in the cream sheet
const GOLD = '#E59824'; // "Points" amber from the location card

// --- Lightweight confetti overlay (no extra dependency) ---
// Brand sticker palette so the celebration matches the rest of the design language.
const CONFETTI_COLORS = [
  Brand.sticker.purple,
  Brand.sticker.pink,
  Brand.sticker.gold,
  Brand.teal,
  Brand.sticker.green,
  '#FFDF34',
];

function ConfettiPiece({ index }: { index: number }) {
  const fall = useRef(new Animated.Value(0)).current;
  const startLeft = (index * 37) % SCREEN_W;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const size = 6 + (index % 3) * 3;
  const delay = (index % 6) * 120;

  useEffect(() => {
    Animated.loop(
      Animated.timing(fall, {
        toValue: 1,
        duration: 2600 + (index % 5) * 400,
        delay,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [fall, delay, index]);

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-40, SCREEN_H * 0.55] });
  const rotate = fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + index * 20}deg`] });
  const translateX = fall.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, (index % 2 ? 30 : -30), 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: startLeft,
        width: size,
        height: size * 1.6,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

function Confetti() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 40 }).map((_, i) => (
        <ConfettiPiece key={i} index={i} />
      ))}
    </View>
  );
}

export default function CameraScreen() {
  const router = useRouter();
  // The location the user tapped CHECK IN on (explore detail sheet). The
  // verification step targets THIS spot; on-site hidden-spot discovery is still
  // detected separately.
  const params = useLocalSearchParams<{ locationId?: string; points?: string }>();
  const targetLocationId = typeof params.locationId === 'string' ? params.locationId : undefined;
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  // Lift bottom controls clear of the floating pill nav (and the home indicator).
  const bottomPad = isWeb ? Spacing.four + WEB_TABBAR_CLEARANCE : insets.bottom + 80;

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Live geofence status for the capture screen. 'in' = inside an unlocked zone,
  // 'hidden' = standing on an undiscovered hidden spot, 'warm' = within ~500m of one.
  const [zone, setZone] = useState<{ status: 'checking' | 'in' | 'out' | 'warm' | 'hidden'; name?: string }>({
    status: 'checking',
  });

  const [flow, setFlow] = useState<FlowState>('capture');
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Verification results
  const [matchedLocation, setMatchedLocation] = useState<ExploreLocation | null>(null);
  const [updatedUser, setUpdatedUser] = useState<User | null>(null);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [isDiscovery, setIsDiscovery] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Reward reveal: any achievements unlocked by this check-in, plus the level the
  // user was on BEFORE it (used to detect a level-up on the verified screen).
  const [newAchievements, setNewAchievements] = useState<Achievement[]>([]);
  const [prevLevel, setPrevLevel] = useState(1);
  // "You're not close enough" data: how far the user actually is + the radius.
  const [tooFar, setTooFar] = useState<{ name: string; distance: number; radius: number } | null>(null);
  // Hard-locked spot (tier in U+1..U+2): the user must LEVEL UP to unlock it —
  // it cannot be discovered. Holds the spot name + the level required to unlock.
  const [locked, setLocked] = useState<{ name: string; levelRequired: number } | null>(null);

  // Guards a second tap while a capture/verification is already in flight.
  const processingRef = useRef(false);

  // Request camera permission on mount (native only; web CameraView handles its own prompt).
  useEffect(() => {
    if (!isWeb && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [isWeb, permission, requestPermission]);

  // Work out whether the user is currently standing inside a check-in zone so the
  // capture screen can show a fun "you're in the X zone" / "no zone here" badge.
  useEffect(() => {
    if (isWeb || flow !== 'capture') return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setZone({ status: 'out' });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const here: Coordinates = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const [locations, user, checkIns] = await Promise.all([
          storage.getLocations(),
          storage.getUser(),
          storage.getCheckIns(),
        ]);
        const level = user?.stats.currentLevel ?? 1;
        const maxTier = unlockedTier(level);
        const maxDisc = maxDiscoverableTier(level);
        const visited = new Set(checkIns.map((c) => c.locationId));

        // Nearest CHECKABLE spot (unlocked, or a hidden one already discovered),
        // and separately the nearest UNDISCOVERED hidden spot (secret tiers ignored).
        let nearestCheckable: ExploreLocation | null = null;
        let nearestCheckableDist = Infinity;
        let nearestHidden: ExploreLocation | null = null;
        let nearestHiddenDist = Infinity;
        for (const loc of locations) {
          if (loc.tier > maxDisc) continue; // secret — never surfaced
          const d = getDistance(here, loc.coordinates);
          const undiscoveredHidden = loc.tier > maxTier && !visited.has(loc.id);
          if (undiscoveredHidden) {
            if (d < nearestHiddenDist) { nearestHiddenDist = d; nearestHidden = loc; }
          } else if (d < nearestCheckableDist) {
            nearestCheckableDist = d;
            nearestCheckable = loc;
          }
        }
        if (cancelled) return;

        if (nearestCheckable && nearestCheckableDist <= (nearestCheckable.geofenceRadius ?? CHECK_IN_RADIUS_M)) {
          setZone({ status: 'in', name: nearestCheckable.name });
        } else if (nearestHidden && nearestHiddenDist <= (nearestHidden.geofenceRadius ?? CHECK_IN_RADIUS_M)) {
          setZone({ status: 'hidden' });
        } else if (nearestHidden && nearestHiddenDist <= WARM_RADIUS_M) {
          setZone({ status: 'warm' });
        } else {
          setZone({ status: 'out' });
        }
      } catch {
        if (!cancelled) setZone({ status: 'out' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isWeb, flow]);

  // Rainbow glow border for the "hidden spot discovered" sheet.
  const rainbow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (flow !== 'verified' || !isDiscovery) return;
    const loop = Animated.loop(
      Animated.timing(rainbow, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, [flow, isDiscovery, rainbow]);
  const rainbowColor = rainbow.interpolate({
    inputRange: [0, 0.17, 0.34, 0.51, 0.68, 0.85, 1],
    outputRange: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff3b30'],
  });

  const resetToCapture = useCallback(() => {
    processingRef.current = false;
    setPhotoUri(null);
    setMatchedLocation(null);
    setUpdatedUser(null);
    setPointsEarned(0);
    setIsDiscovery(false);
    setErrorMessage('');
    setNewAchievements([]);
    setTooFar(null);
    setLocked(null);
    setFlow('capture');
  }, []);

  // Haversine distance in meters (reused approach from explore.tsx).
  const getDistance = (a: Coordinates, b: Coordinates) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const handleShutter = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics unsupported (e.g. web) — ignore.
    }
    if (isWeb || !cameraRef.current) {
      // Fallback: no native capture, use a placeholder so the flow can continue.
      setPhotoUri(null);
      setFlow('preview');
      return;
    }
    try {
      // Compress at capture: a full-resolution phone photo is several MB, which
      // is slow/unreliable to upload over the dev server (and can blow the
      // server's 10MB image limit). quality 0.5 keeps a clear verification photo
      // at a fraction of the size, so the multipart upload completes reliably.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      // Move the capture out of the clearable cache into permanent storage so the
      // local thumbnail + upload-retry survive app restarts (Android can purge
      // the camera cache uri at any time).
      const permanentUri = photo?.uri ? persistPhoto(photo.uri) : null;
      setPhotoUri(permanentUri);
      setFlow('preview');
    } catch (e) {
      console.warn('Failed to capture photo', e);
      setPhotoUri(null);
      setFlow('preview');
    }
  };

  const toggleFlash = () => setFlash((f) => (f === 'off' ? 'on' : 'off'));
  const flipCamera = () => setFacing((f) => (f === 'back' ? 'front' : 'back'));

  // Run the real proximity verification + persist the check-in.
  const runVerification = async () => {
    // #3: guard duplicate taps — a second press while a check-in is in flight
    // does nothing. The flag is cleared on every terminal state (reset/back).
    if (processingRef.current) return;
    processingRef.current = true;

    // #3: switch to the verifying UI IMMEDIATELY, before any async work, so the
    // user gets instant feedback instead of a silent delay.
    setFlow('verifying');

    // 1. Get the device's LIVE position. The geofence MUST be enforced from real
    // GPS, so if we can't get a fix we cannot record the check-in. Race the
    // permission+fix against a timeout so a stuck GPS can't stall forever.
    let coords: Coordinates | null = null;
    try {
      coords = await Promise.race<Coordinates | null>([
        (async () => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return null;
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
    } catch (e) {
      console.warn('Failed to get location for verification', e);
    }

    // 2. Mock server delay (verification spinner).
    await new Promise((r) => setTimeout(r, VERIFY_DURATION_MS));

    const locations = await storage.getLocations();
    if (locations.length === 0) {
      setErrorMessage('No locations available to check in.');
      setFlow('error');
      return;
    }

    const verifyUser = await storage.getUser();
    const level = verifyUser?.stats.currentLevel ?? 1;
    const maxTier = unlockedTier(level);
    const maxDisc = maxDiscoverableTier(level);
    // Floor tier ABOVE which a spot becomes hidden-discoverable (the rainbow band).
    // tier <= maxTier: normal · maxTier < tier <= discoveryFloor: HARD-LOCKED (level
    // up, no discovery) · discoveryFloor < tier <= maxDisc: discoverable (currently
    // exactly maxTier+3) · tier > maxDisc: secret.
    const discoveryFloor = maxTier + LOCK_TEASER_RANGE;

    // No live GPS → we cannot prove the user is on-site, so we cannot check in.
    if (!coords) {
      setErrorMessage(
        "We couldn't get your location. Enable location access and try again from the spot."
      );
      setFlow('error');
      return;
    }

    // 3. Resolve the TARGET location. Prefer the spot the user tapped CHECK IN on
    // (passed from explore). The user must be physically inside its geofence.
    const tapped = targetLocationId
      ? locations.find((loc) => loc.id === targetLocationId && loc.tier <= maxDisc) ?? null
      : null;

    // Separately, the nearest UNDISCOVERED hidden spot the user is standing on —
    // discovery only happens on-site (within range).
    let onsiteHidden: ExploreLocation | null = null;
    let onsiteHiddenDist = Infinity;
    const priorCheckIns = await storage.getCheckIns();
    const visited = new Set(priorCheckIns.map((c) => c.locationId));
    for (const loc of locations) {
      if (loc.tier > maxDisc) continue; // secret — never surfaced
      // Only the band ABOVE the hard-lock teasers (currently exactly maxTier+3) is
      // discoverable; tiers in maxTier+1..maxTier+LOCK_TEASER_RANGE are hard-locked.
      const undiscoveredHidden = loc.tier > discoveryFloor && !visited.has(loc.id);
      if (!undiscoveredHidden) continue;
      const d = getDistance(coords, loc.coordinates);
      if (d <= effectiveRadius(loc) && d < onsiteHiddenDist) {
        onsiteHiddenDist = d;
        onsiteHidden = loc;
      }
    }

    // A discovery on-site takes precedence (the rainbow first-find moment).
    // Otherwise check in to the tapped target. Either way, GPS must be in range.
    let target: ExploreLocation | null = null;
    let inRange = false;
    if (onsiteHidden) {
      target = onsiteHidden;
      inRange = true; // already filtered to within radius above
    } else if (tapped) {
      // HARD-LOCKED band (tier in maxTier+1 .. maxTier+LOCK_TEASER_RANGE): the user
      // must LEVEL UP — this spot cannot be checked in or discovered. Do NOT record
      // anything; show the branded "level up to unlock" state. Proximity is
      // irrelevant here, so this gate comes before the geofence check.
      if (tapped.tier > maxTier && tapped.tier <= discoveryFloor) {
        setLocked({ name: tapped.name, levelRequired: levelForTier(tapped.tier) });
        setFlow('locked');
        return;
      }
      const d = getDistance(coords, tapped.coordinates);
      inRange = d <= effectiveRadius(tapped);
      if (!inRange) {
        // #8: too far — do NOT record. Show a clear, branded distance state.
        setTooFar({ name: tapped.name, distance: d, radius: effectiveRadius(tapped) });
        setFlow('toofar');
        return;
      }
      target = tapped;
    }

    if (!target || !inRange) {
      setErrorMessage("You're not close enough to any check-in spot.");
      setFlow('error');
      return;
    }

    // 3b. Enforce the 24h per-location re-check-in cooldown (spec 06).
    const readyAt = storage.nextCheckInAt(target.id);
    if (readyAt) {
      const hoursLeft = Math.max(1, Math.ceil((readyAt.getTime() - Date.now()) / (60 * 60 * 1000)));
      setErrorMessage(
        `You've already checked in at ${target.name}. It will be available again in ${hoursLeft}h.`
      );
      setFlow('error');
      return;
    }

    // 4. Discovery? A first-ever check-in at a hidden spot in the discoverable band
    // (tier > discoveryFloor, i.e. above the hard-locked teasers) earns the one-time
    // discovery bonus (DISCOVERY_MULTIPLIER) and the rainbow treatment.
    const discovered = target.tier > discoveryFloor && !visited.has(target.id);
    const earned = discovered ? target.points * DISCOVERY_MULTIPLIER : target.points;

    // #9: capture the level BEFORE the check-in so we can detect a level-up.
    const levelBefore = verifyUser?.stats.currentLevel ?? 1;

    // 5. Build + persist the check-in.
    const checkIn: CheckIn = {
      id: 'checkin_' + Math.random().toString(36).slice(2, 11),
      userId: verifyUser?.uid ?? 'anonymous',
      locationId: target.id,
      photoUrl: photoUri ?? target.imageUrls[0],
      pointsEarned: earned,
      timestamp: new Date().toISOString(),
      coordinatesChecked: coords,
      verifiedOffline: false,
    };

    let isOnline = true;
    try {
      const net = await NetInfo.fetch();
      isOnline = net.isConnected !== false;
    } catch {
      isOnline = true;
    }

    try {
      if (isOnline) {
        await storage.addCheckIn(checkIn);
        // Best-effort immediate upload to the server (multipart + photo). On
        // failure we queue it so uploadPendingCheckIns() retries on next launch
        // / after the next check-in — the LOCAL record above already stands.
        const uploaded = await uploadCheckInNow({
          locationId: target.id,
          locationName: target.name,
          photoUri: checkIn.photoUrl,
          pointsEarned: earned,
          latitude: coords.latitude,
          longitude: coords.longitude,
          verifiedOffline: false,
          checkedInAt: checkIn.timestamp,
        });
        if (!uploaded) {
          await storage.queueOfflineCheckIn(target.id, checkIn.photoUrl, coords, earned);
        }
      } else {
        checkIn.verifiedOffline = true;
        await storage.addCheckIn(checkIn);
        await storage.queueOfflineCheckIn(target.id, checkIn.photoUrl, coords, earned);
      }
    } catch (e) {
      // Backstop (e.g. the storage tier-gate) — surface instead of hanging.
      setErrorMessage(e instanceof Error ? e.message : 'Could not record the check-in.');
      setFlow('error');
      return;
    }

    // Flush any previously-queued uploads now that we (likely) have connectivity.
    // Fire-and-forget: must not delay the reward reveal.
    void uploadPendingCheckIns();

    // 6. Re-fetch user for fresh XP/level stats, and collect any achievements the
    // engine just unlocked (storage.addCheckIn ran evaluateAchievements). We read
    // them, then acknowledge so they don't re-appear on the next reveal.
    const fresh = await storage.getUser();
    let unlockedNow: Achievement[] = [];
    try {
      const all = await storage.getAchievements();
      unlockedNow = all.filter((a) => a.isUnlocked && a.isNew);
      if (unlockedNow.length > 0) await storage.acknowledgeNewAchievements();
    } catch (e) {
      console.warn('Failed to read new achievements', e);
    }

    setMatchedLocation(target);
    setUpdatedUser(fresh);
    setPointsEarned(earned);
    setIsDiscovery(discovered);
    setNewAchievements(unlockedNow);
    setPrevLevel(levelBefore);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // ignore
    }
    setFlow('verified');
  };

  // ----- Render helpers -----

  const zoneText =
    zone.status === 'in'
      ? zone.name
        ? `You're in the ${zone.name} zone! 🎯`
        : "You're in a check-in zone! 🎯"
      : zone.status === 'hidden'
        ? 'Hidden spot found! 🌈 Snap to claim it'
        : zone.status === 'warm'
          ? "Getting warm… something hidden's nearby 🔍"
          : zone.status === 'out'
            ? 'No zone here — roam closer to a spot! 🧭'
            : 'Scanning for a zone…';
  const zoneIcon: keyof typeof Ionicons.glyphMap =
    zone.status === 'in'
      ? 'navigate-circle'
      : zone.status === 'hidden'
        ? 'sparkles'
        : zone.status === 'warm'
          ? 'flame'
          : zone.status === 'out'
            ? 'compass-outline'
            : 'navigate-outline';
  const zonePillStyle =
    zone.status === 'in'
      ? styles.zonePillIn
      : zone.status === 'hidden'
        ? styles.zonePillHidden
        : zone.status === 'warm'
          ? styles.zonePillWarm
          : zone.status === 'out'
            ? styles.zonePillOut
            : styles.zonePillChecking;
  const zoneColor = zone.status === 'in' ? '#0f5132' : zone.status === 'hidden' ? '#fff' : Brand.ink;

  const renderCaptureControls = () => (
    <>
      {/* Top-center geofence status: in-zone, hidden-spot, warm, or nothing nearby. */}
      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <View style={[styles.zonePill, stampBorder, zonePillStyle]}>
          <Ionicons name={zoneIcon} size={16} color={zoneColor} />
          <BrandText weight="bold" style={[styles.zoneText, { color: zoneColor }]}>
            {zoneText}
          </BrandText>
        </View>
      </SafeAreaView>

      {/* Bottom controls: centered white ring shutter, flash + flip on the right */}
      <View style={[styles.bottomBar, { paddingBottom: bottomPad }]} pointerEvents="box-none">
        <View style={styles.shutterRow}>
          <View style={styles.sideSlot} />
          <TouchableOpacity style={styles.shutterOuter} onPress={handleShutter} activeOpacity={0.8}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <View style={[styles.sideSlot, styles.sideSlotRight]}>
            <TouchableOpacity style={styles.smallGlassButton} onPress={toggleFlash}>
              <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallGlassButton} onPress={flipCamera}>
              <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );

  // Capture: live camera (or web/permission fallback).
  if (flow === 'capture') {
    const canShowCamera = !isWeb && permission?.granted;

    return (
      <View style={styles.fullScreen}>
        {canShowCamera ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />
        ) : (
          <View style={styles.fallback}>
            <Ionicons name="camera-outline" size={56} color="#9ca3af" />
            <BrandText weight="bold" color="#fff" style={styles.fallbackTitle}>Camera not available</BrandText>
            <BrandText weight="medium" color="#9ca3af" style={styles.fallbackText}>
              {isWeb
                ? 'Live camera is limited here. Simulate a check-in to continue.'
                : permission && !permission.granted
                  ? 'Camera permission is required to take a check-in photo.'
                  : 'Preparing camera…'}
            </BrandText>
            {!isWeb && permission && !permission.granted && (
              <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                <BrandText weight="bold" color={Brand.ink} style={styles.permissionButtonText}>Grant camera access</BrandText>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.simulateButton, stampBorder]} onPress={handleShutter} activeOpacity={0.85}>
              <Ionicons name="sparkles-outline" size={18} color={Brand.ink} />
              <BrandText weight="bold" color={Brand.ink} style={styles.simulateButtonText}>Simulate check-in</BrandText>
            </TouchableOpacity>
          </View>
        )}
        {canShowCamera && renderCaptureControls()}
      </View>
    );
  }

  // Preview / verifying / verified / error all show the frozen photo.
  const FrozenPhoto = () =>
    photoUri ? (
      <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    ) : (
      <View style={[StyleSheet.absoluteFill, styles.frozenPlaceholder]}>
        <Ionicons name="image-outline" size={64} color="#6b7280" />
        <BrandText weight="medium" color="#9ca3af" style={{ marginTop: Spacing.two }}>
          Simulated photo
        </BrandText>
      </View>
    );

  // Preview state.
  if (flow === 'preview') {
    return (
      <View style={styles.fullScreen}>
        <FrozenPhoto />
        <SafeAreaView style={styles.topBarLeft} edges={['top']} pointerEvents="box-none">
          <TouchableOpacity style={styles.closeButton} onPress={resetToCapture} activeOpacity={0.8}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </SafeAreaView>
        <View style={[styles.bottomBar, { paddingBottom: bottomPad }]} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.pillCheckIn, stampBorder]}
            onPress={runVerification}
            disabled={processingRef.current}
            activeOpacity={0.85}
          >
            <Ionicons name="camera" size={20} color={Brand.ink} />
            <BrandText weight="bold" color={Brand.ink} style={styles.pillText}>CHECK IN</BrandText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Verifying state — instant feedback while GPS + storage run.
  if (flow === 'verifying') {
    return (
      <View style={styles.fullScreen}>
        <FrozenPhoto />
        <View style={styles.dimOverlay} />
        <View style={styles.verifyingCenter} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <BrandText weight="bold" color="#fff" style={styles.verifyingText}>
            Verifying you&apos;re here…
          </BrandText>
        </View>
        <View style={[styles.bottomBar, { paddingBottom: bottomPad }]} pointerEvents="box-none">
          <View style={[styles.pillCheckIn, styles.pillVerifying, stampBorder]}>
            <ActivityIndicator size="small" color={Brand.ink} />
            <BrandText weight="bold" color={Brand.ink} style={styles.pillText}>VERIFYING</BrandText>
          </View>
        </View>
      </View>
    );
  }

  // Too-far state (#8): live GPS placed the user outside the geofence — no
  // check-in was recorded. Show how far they are + the required radius.
  if (flow === 'toofar') {
    return (
      <View style={styles.fullScreen}>
        <FrozenPhoto />
        <View style={styles.dimOverlay} />
        <SafeAreaView style={styles.centerSheetWrap} edges={['bottom']}>
          <View style={[styles.errorCard, stampBorder]}>
            <Ionicons name="walk-outline" size={48} color={Brand.purple} />
            <BrandText weight="bold" color={DARK_BROWN} style={styles.cardTitle}>
              You&apos;re not close enough
            </BrandText>
            <BrandText weight="medium" color={DARK_BROWN_SECONDARY} style={styles.errorBody}>
              {tooFar
                ? `You're ${formatDistance(tooFar.distance)} from ${tooFar.name}. Get within ${formatDistance(
                    tooFar.radius
                  )} to check in.`
                : "Move closer to the spot to check in."}
            </BrandText>
            <TouchableOpacity
              style={[styles.purpleButton, stampBorder]}
              onPress={() => router.push('/explore')}
              activeOpacity={0.85}
            >
              <Ionicons name="map-outline" size={18} color={Brand.bg} />
              <BrandText weight="bold" color={Brand.bg} style={styles.purpleButtonText}>BACK TO MAP</BrandText>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Hard-locked state: the tapped spot is in the level-up band (tier in
  // maxTier+1..maxTier+LOCK_TEASER_RANGE). It is NOT discoverable — the user must
  // level up. Nothing was recorded; show the branded "level up to unlock" state.
  if (flow === 'locked') {
    return (
      <View style={styles.fullScreen}>
        <FrozenPhoto />
        <View style={styles.dimOverlay} />
        <SafeAreaView style={styles.centerSheetWrap} edges={['bottom']}>
          <View style={[styles.errorCard, stampBorder]}>
            <Ionicons name="lock-closed" size={48} color={Brand.purple} />
            <BrandText weight="bold" color={DARK_BROWN} style={styles.cardTitle}>
              {locked ? `Reach level ${locked.levelRequired} to unlock ${locked.name}` : 'Level up to unlock this spot'}
            </BrandText>
            <BrandText weight="medium" color={DARK_BROWN_SECONDARY} style={styles.errorBody}>
              This spot is locked. Keep checking in to level up — you can&apos;t discover it early.
            </BrandText>
            <TouchableOpacity
              style={[styles.purpleButton, stampBorder]}
              onPress={() => router.push('/explore')}
              activeOpacity={0.85}
            >
              <Ionicons name="map-outline" size={18} color={Brand.bg} />
              <BrandText weight="bold" color={Brand.bg} style={styles.purpleButtonText}>BACK TO MAP</BrandText>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Error state (not near any location).
  if (flow === 'error') {
    return (
      <View style={styles.fullScreen}>
        <FrozenPhoto />
        <View style={styles.dimOverlay} />
        <SafeAreaView style={styles.centerSheetWrap} edges={['bottom']}>
          <View style={[styles.errorCard, stampBorder]}>
            <Ionicons name="alert-circle-outline" size={48} color={Brand.sticker.pink} />
            <BrandText weight="bold" color={DARK_BROWN} style={styles.cardTitle}>Check-in failed</BrandText>
            <BrandText weight="medium" color={DARK_BROWN_SECONDARY} style={styles.errorBody}>
              {errorMessage}
            </BrandText>
            <TouchableOpacity style={[styles.purpleButton, stampBorder]} onPress={resetToCapture} activeOpacity={0.85}>
              <Ionicons name="camera-outline" size={18} color={Brand.bg} />
              <BrandText weight="bold" color={Brand.bg} style={styles.purpleButtonText}>TRY AGAIN</BrandText>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Verified state shows the dimmed photo backdrop.
  const stats = updatedUser?.stats;
  const progressPct =
    stats && stats.xpNeededForNextLevel > 0
      ? Math.min(100, (stats.currentXPInLevel / stats.xpNeededForNextLevel) * 100)
      : 0;
  // #9: did this check-in push the user up a level (or more)?
  const leveledUp = !!stats && stats.currentLevel > prevLevel;

  return (
    <View style={styles.fullScreen}>
      <FrozenPhoto />
      <View style={styles.dimOverlay} />

      {flow === 'verified' && (
        <>
          {/* X close over the dimmed preview (top-left, Figma node 340:1618) */}
          <SafeAreaView style={styles.topBarLeft} edges={['top']} pointerEvents="box-none">
            <TouchableOpacity style={styles.closeButton} onPress={() => router.push('/explore')} activeOpacity={0.8}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>

          <Confetti />

          <View style={[styles.verifiedSheetWrap, { bottom: isWeb ? WEB_TABBAR_CLEARANCE : insets.bottom + 80 }]}>
            <Animated.View style={isDiscovery ? [styles.discoveryGlow, { borderColor: rainbowColor }] : undefined}>
            <View style={styles.verifiedCard}>
              <ScrollView
                style={styles.verifiedScroll}
                contentContainerStyle={styles.verifiedScrollContent}
                showsVerticalScrollIndicator={false}
              >
              {/* Header section: drag handle + title */}
              <View style={styles.sheetSection}>
                <View style={styles.dragHandle} />
                <BrandText weight="bold" color={DARK_BROWN} style={styles.cardTitle}>
                  {isDiscovery ? 'Hidden spot discovered! 🌈' : 'Checked in!'}
                </BrandText>
                {isDiscovery && (
                  <BrandText weight="bold" color={Brand.purple} style={styles.discoveryBonus}>
                    {DISCOVERY_MULTIPLIER}× first-find bonus!
                  </BrandText>
                )}
                {leveledUp && stats && (
                  <View style={styles.levelUpPill}>
                    <Ionicons name="arrow-up-circle" size={16} color={Brand.bg} />
                    <BrandText weight="bold" color={Brand.bg} style={styles.levelUpText}>
                      Level up! You reached level {stats.currentLevel}
                    </BrandText>
                  </View>
                )}
              </View>

              {/* XP / level progress section: badges flanking the bar */}
              {stats && (
                <View style={styles.sheetSection}>
                  <BrandText weight="bold" color={Brand.sticker.pink} style={styles.xpGainLabel}>
                    + {pointsEarned} XP
                  </BrandText>
                  <View style={styles.levelRow}>
                    <View style={[styles.levelBadge, styles.levelBadgeCurrent]}>
                      <BrandText weight="bold" color={Brand.bg} style={styles.levelBadgeText}>
                        {stats.currentLevel}
                      </BrandText>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                    </View>
                    <View style={[styles.levelBadge, styles.levelBadgeNext]}>
                      <BrandText weight="bold" color={Brand.bg} style={styles.levelBadgeText}>
                        {stats.currentLevel + 1}
                      </BrandText>
                    </View>
                  </View>
                  <BrandText weight="medium" style={styles.progressCountText}>
                    {stats.currentXPInLevel}/{stats.xpNeededForNextLevel}
                  </BrandText>
                </View>
              )}

              {/* Newly unlocked achievements (#9) — sourced from the achievement
                  engine via storage.getAchievements() filtered by isUnlocked && isNew. */}
              {newAchievements.length > 0 && (
                <View style={styles.sheetSection}>
                  <BrandText weight="bold" color={DARK_BROWN} style={styles.achHeading}>
                    {newAchievements.length === 1
                      ? 'Achievement unlocked! 🏅'
                      : `${newAchievements.length} achievements unlocked! 🏅`}
                  </BrandText>
                  {newAchievements.map((ach) => (
                    <View key={ach.id} style={[styles.achCard, stampBorder]}>
                      <View style={styles.achIconWrap}>
                        <Ionicons
                          name={(ach.iconName as keyof typeof Ionicons.glyphMap) ?? 'trophy-outline'}
                          size={22}
                          color={Brand.bg}
                        />
                      </View>
                      <View style={styles.achInfo}>
                        <BrandText weight="bold" color={DARK_BROWN} style={styles.achTitle} numberOfLines={1}>
                          {ach.title}
                        </BrandText>
                        <BrandText
                          weight="medium"
                          color={DARK_BROWN_SECONDARY}
                          style={styles.achDesc}
                          numberOfLines={2}
                        >
                          {ach.description}
                        </BrandText>
                      </View>
                      <View style={styles.achDifficultyBadge}>
                        <BrandText weight="bold" color={Brand.bg} style={styles.achDifficultyText}>
                          {ach.difficulty}
                        </BrandText>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Location card section */}
              {matchedLocation && (
                <View style={styles.sheetSection}>
                  <View style={[styles.locationCard, stampBorder]}>
                    <Image source={{ uri: matchedLocation.imageUrls[0] }} style={styles.locationThumb} />
                    <View style={styles.locationInfo}>
                      <View style={styles.locationNameRow}>
                        <BrandText weight="medium" color={DARK_BROWN} style={styles.locationName} numberOfLines={1}>
                          {matchedLocation.name}
                        </BrandText>
                        <Ionicons name="checkmark-circle" size={14} color={Brand.sticker.green} />
                      </View>
                      <View style={styles.locationMetaRow}>
                        <Ionicons name="location-outline" size={16} color={DARK_BROWN_SECONDARY} />
                        <BrandText weight="medium" color={DARK_BROWN_SECONDARY} style={styles.locationAddress} numberOfLines={2}>
                          {matchedLocation.address}
                        </BrandText>
                      </View>
                      <View style={styles.locationMetaRow}>
                        <Ionicons name="trophy" size={16} color={GOLD} />
                        <BrandText weight="medium" color={GOLD} style={styles.locationPointsText}>
                          {matchedLocation.points} Points
                        </BrandText>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              </ScrollView>

              {/* BACK TO MAP — purple stamp button, right-aligned. Pinned below
                  the scrollable reveal so it's always reachable. */}
              <View style={styles.sheetActionSection}>
                <TouchableOpacity style={[styles.purpleButton, stampBorder]} onPress={() => router.push('/explore')} activeOpacity={0.85}>
                  <Ionicons name="map-outline" size={18} color={Brand.bg} />
                  <BrandText weight="bold" color={Brand.bg} style={styles.purpleButtonText}>BACK TO MAP</BrandText>
                </TouchableOpacity>
              </View>
            </View>
            </Animated.View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: Spacing.five,
    gap: Spacing.two,
  },
  fallbackTitle: {
    fontFamily: BrandFonts.bold,
    fontSize: 20,
    color: '#fff',
    marginTop: Spacing.two,
  },
  fallbackText: {
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  permissionButton: {
    borderWidth: 1,
    borderColor: Brand.teal,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 24,
  },
  permissionButtonText: {
    color: Brand.teal,
    fontFamily: BrandFonts.bold,
  },
  simulateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Brand.teal,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 28,
    marginTop: Spacing.two,
  },
  simulateButtonText: {
    color: Brand.ink,
    fontFamily: BrandFonts.bold,
    fontSize: 15,
  },

  // Top / bottom bars
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  // Game-y geofence status pill at the top of the viewfinder.
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 3,
    borderRadius: BrandRadius.pill,
    maxWidth: '92%',
  },
  zonePillIn: {
    backgroundColor: Brand.sticker.green,
  },
  zonePillOut: {
    backgroundColor: Brand.bg,
  },
  zonePillChecking: {
    backgroundColor: Brand.surface,
  },
  zonePillHidden: {
    backgroundColor: Brand.purple,
  },
  zonePillWarm: {
    backgroundColor: Brand.sticker.gold,
  },
  zoneText: {
    fontSize: 13,
    color: Brand.ink,
    flexShrink: 1,
  },
  zoneTextIn: {
    color: '#0f5132',
  },
  topBarLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    zIndex: 10,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four + WEB_TABBAR_CLEARANCE,
    alignItems: 'center',
  },
  // Light rounded menu button with the stamp border (Figma viewfinder).
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Brand.bg,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: Brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallGlassButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shutter
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  sideSlot: {
    width: 96,
    alignItems: 'flex-start',
  },
  sideSlotRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },

  // Frozen photo
  frozenPlaceholder: {
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // Pills — teal stamp pill for CHECK IN / VERIFYING.
  pillCheckIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.teal,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: BrandRadius.pill,
  },
  pillVerifying: {
    backgroundColor: Brand.teal,
  },
  pillText: {
    fontSize: 16,
    letterSpacing: 0.5,
  },

  // Sheets
  verifiedSheetWrap: {
    position: 'absolute',
    bottom: WEB_TABBAR_CLEARANCE,
    left: 0,
    right: 0,
  },
  centerSheetWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  verifiedCard: {
    backgroundColor: CREAM,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderColor: Brand.ink,
    overflow: 'hidden',
    maxHeight: SCREEN_H * 0.78,
  },
  verifiedScroll: {
    flexShrink: 1,
  },
  verifiedScrollContent: {
    paddingBottom: 0,
  },
  // Animated rainbow glow around the sheet when a hidden spot is discovered.
  discoveryGlow: {
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  discoveryBonus: {
    fontSize: 12,
    marginTop: 2,
  },
  // Centered spinner + copy shown the instant the photo is captured (#3).
  verifyingCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  verifyingText: {
    fontSize: 15,
    letterSpacing: 0.3,
  },
  // Level-up callout pill in the verified header (#9).
  levelUpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    backgroundColor: Brand.purple,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: BrandRadius.pill,
    marginTop: 2,
  },
  levelUpText: {
    fontSize: 12,
  },
  // Newly unlocked achievement reveal (#9).
  achHeading: {
    fontSize: 14,
    textAlign: 'center',
  },
  achCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDFB',
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
  },
  achIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.sticker.gold,
  },
  achInfo: {
    flex: 1,
    gap: 2,
  },
  achTitle: {
    fontSize: 14,
  },
  achDesc: {
    fontSize: 12,
    lineHeight: 15,
  },
  achDifficultyBadge: {
    backgroundColor: Brand.purple,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
  },
  achDifficultyText: {
    fontSize: 10,
  },
  // Each stacked block in the cream sheet, divided by a faint hairline.
  sheetSection: {
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    gap: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
  },
  sheetActionSection: {
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'flex-end',
  },
  dragHandle: {
    width: 50,
    height: 3,
    borderRadius: BrandRadius.pill,
    backgroundColor: 'rgba(42,36,33,0.2)',
  },
  errorCard: {
    backgroundColor: CREAM,
    borderRadius: BrandRadius.control,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    width: '100%',
  },
  cardTitle: {
    fontSize: 18,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 13,
    textAlign: 'center',
  },

  // XP block
  xpGainLabel: {
    alignSelf: 'center',
    fontSize: 11,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    width: '100%',
  },
  levelBadge: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Brand.ink,
  },
  levelBadgeCurrent: {
    backgroundColor: Brand.sticker.pink,
  },
  levelBadgeNext: {
    backgroundColor: Brand.purple,
  },
  levelBadgeText: {
    fontSize: 18,
  },
  progressTrack: {
    flex: 1,
    height: 16,
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.ink,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Brand.purple,
    borderRadius: BrandRadius.pill,
  },
  progressCountText: {
    alignSelf: 'flex-end',
    marginRight: 55,
    marginTop: -Spacing.two,
    fontSize: 10,
    color: 'rgba(42,36,33,0.4)',
  },

  // Location card
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDFB',
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
  },
  locationThumb: {
    width: 75,
    height: 75,
    borderRadius: BrandRadius.control,
    backgroundColor: '#eee',
  },
  locationInfo: {
    flex: 1,
    gap: Spacing.two,
  },
  locationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationName: {
    fontSize: 14,
    flexShrink: 1,
  },
  locationMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  locationAddress: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
  },
  locationPointsText: {
    fontSize: 12,
  },

  // Buttons
  purpleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.purple,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  purpleButtonText: {
    fontSize: 13,
    letterSpacing: 0.65,
  },
});
