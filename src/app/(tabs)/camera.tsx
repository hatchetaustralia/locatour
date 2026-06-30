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
  PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import { File, Directory, Paths } from 'expo-file-system';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandText } from '@/components/brand';
import { HiddenNearbyBar } from '@/components/hidden-nearby-bar';
import { ShutterButton, ShutterMode } from '@/components/shutter-button';
import { LevelUpBar } from '@/components/level-up-bar';
import { PassportStamp } from '@/components/passport-stamp';
import { Brand, BrandFonts, BrandRadius, stampBorder, Spacing } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { uploadCheckInNow, uploadPendingCheckIns, recordUnlock } from '@/utils/account';
import { fireArrivalNotification } from '@/utils/geofencing';
import {
  unlockedTier,
  levelForTier,
} from '@/utils/leveling';
import { getConfig, tierRadiusBoost } from '@/utils/runtime-config';
import { classifyNearby } from '@/utils/hidden-detection';
import { useLocationContext } from '@/context/location-context';
import { formatDistance } from '@/utils/geo';
import { ExploreLocation, CheckIn, User, Coordinates, Achievement } from '@/types';

// --- Tuning flags ---
// Mock verification duration (later this becomes a real server call).
const VERIFY_DURATION_MS = 1800;


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

  // Tie the live preview to screen focus. expo-camera (v55) allows only ONE active
  // preview at a time and requires it to be UNMOUNTED when the screen is unfocused —
  // a CameraView left mounted across a tab switch comes back BLACK on Android (the
  // `active` prop that would pause it is iOS-only). Gating the mount on isFocused
  // unmounts on blur and remounts a fresh native session on return, killing the
  // black-screen-on-tab-return bug.
  const isFocused = useIsFocused();

  // Live geofence status for the capture screen. 'in' = inside an unlocked zone,
  // 'hidden' = standing on an undiscovered hidden spot, 'warm' = within ~500m of one.
  const [zone, setZone] = useState<{ status: 'checking' | 'in' | 'out' | 'warm' | 'hidden'; name?: string }>({
    status: 'checking',
  });
  // Live metres to the nearest undiscovered hidden spot (when warm/hidden) — drives
  // the live distance readout that ticks down as the explorer closes in.
  const [hiddenDistance, setHiddenDistance] = useState<number | null>(null);
  // The hidden spot the user is currently ON (within range) — drives the
  // "You've unlocked X" card. Captured when the zone goes 'hidden'.
  const [hiddenSpot, setHiddenSpot] = useState<{ id: string; name: string; image?: string } | null>(null);
  // Tier of the spot whose zone you're currently in/on (checkable or hidden).
  // Drives the 'gem' shutter glow when checking in at a high-rarity spot, even
  // when the camera was opened from the tab (no tapped target). 0 = no spot.
  const [activeTier, setActiveTier] = useState(0);

  const [flow, setFlow] = useState<FlowState>('capture');
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // Raw EXIF from the capture, attached to the check-in for admin verification.
  const [photoExif, setPhotoExif] = useState<Record<string, any> | null>(null);

  // Verification results
  const [matchedLocation, setMatchedLocation] = useState<ExploreLocation | null>(null);
  const [updatedUser, setUpdatedUser] = useState<User | null>(null);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [isDiscovery, setIsDiscovery] = useState(false);
  // Whether this check-in earned the Nearby-Alerts explorer bonus (for the reveal).
  const [explorerBonus, setExplorerBonus] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Reward reveal: any achievements unlocked by this check-in, plus the level the
  // user was on BEFORE it (used to detect a level-up on the verified screen).
  const [newAchievements, setNewAchievements] = useState<Achievement[]>([]);
  // Collapse a big first-check-in haul: show 3, hide the rest behind "Show more".
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [prevLevel, setPrevLevel] = useState(1);
  // "You're not close enough" data: how far the user actually is + the radius.
  const [tooFar, setTooFar] = useState<{ name: string; distance: number; radius: number } | null>(null);
  // Hard-locked spot (tier in U+1..U+2): the user must LEVEL UP to unlock it —
  // it cannot be discovered. Holds the spot name + the level required to unlock.
  const [locked, setLocked] = useState<{ name: string; levelRequired: number } | null>(null);

  // Name of the spot the user tapped CHECK IN on — used for the Polaroid caption
  // on the preview/confirm step.
  const [targetName, setTargetName] = useState('');

  // Guards a second tap while a capture/verification is already in flight.
  const processingRef = useRef(false);
  // The hidden-spot id we've already unlocked this approach — so the unlock +
  // card fire ONCE per spot, not on every GPS tick.
  const currentHiddenIdRef = useRef<string | null>(null);
  // Transient "get closer" nudge shown when the shutter is tapped out of range.
  const [nudge, setNudge] = useState(false);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether we're in check-in range, to fire a one-shot "you've arrived"
  // success haptic the moment the user walks INTO range (felt through a pocket
  // when the app is open).
  const arrivedRef = useRef(false);

  // Resolve the tapped location's name for the preview caption (best-effort).
  useEffect(() => {
    if (!targetLocationId) return;
    let cancelled = false;
    storage
      .getLocationById(targetLocationId)
      .then((loc) => {
        if (!cancelled && loc) setTargetName(loc.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [targetLocationId]);

  // Request camera permission on mount (native only; web CameraView handles its own prompt).
  useEffect(() => {
    if (!isWeb && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [isWeb, permission, requestPermission]);

  // Work out whether the user is currently standing inside a check-in zone so the
  // Shared located slice + level + visited/unlocked from the LocationProvider. The
  // camera keeps its OWN high-frequency watch below (live compass distance +
  // check-in gating) but no longer fetches locations per capture entry — it reads
  // them from this ref so the watch callback closure stays current without
  // re-subscribing the watch each time the inputs change.
  const {
    reachable,
    level: ctxLevel,
    visitedIds: ctxVisited,
    unlockedIds: ctxUnlocked,
    hiddenWarm,
    hiddenDistanceM,
    refresh,
  } = useLocationContext();
  const detectInputs = useRef({
    locations: reachable,
    level: ctxLevel,
    visited: ctxVisited,
    unlocked: ctxUnlocked,
  });
  useEffect(() => {
    detectInputs.current = {
      locations: reachable,
      level: ctxLevel,
      visited: ctxVisited,
      unlocked: ctxUnlocked,
    };
  }, [reachable, ctxLevel, ctxVisited, ctxUnlocked]);

  // capture screen can show a fun "you're in the X zone" / "no zone here" badge.
  useEffect(() => {
    if (isWeb || flow !== 'capture') return;
    let cancelled = false;
    let watchSub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setZone({ status: 'out' });
          return;
        }
        // Recompute the zone (and the live distance to the nearest hidden spot) on
        // every position update so the temperature gauge heats up as the explorer
        // closes in. Detection routes through the SHARED classifier (with inputs
        // from the shared provider, via detectInputs) so the camera, the map and
        // home all agree on what's hidden — see utils/hidden-detection.
        const evaluate = (here: Coordinates) => {
          const { locations, level, visited, unlocked } = detectInputs.current;
          const { checkable, hidden } = classifyNearby(here, locations, level, {
            visitedIds: visited,
            unlockedIds: unlocked,
          });
          const nearestCheckable = checkable?.spot ?? null;
          const nearestCheckableDist = checkable?.distanceM ?? Infinity;
          const nearestHidden = hidden?.spot ?? null;
          const nearestHiddenDist = hidden?.distanceM ?? Infinity;
          if (cancelled) return;

          // One-shot "you've arrived" success haptic when crossing INTO range.
          const cfg = getConfig();
          const inRangeNow =
            (!!nearestCheckable && nearestCheckableDist <= cfg.checkInRadiusM) ||
            (!!nearestHidden && nearestHiddenDist <= cfg.hiddenRadiusM);
          if (inRangeNow && !arrivedRef.current) {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              // ignore
            }
          }
          arrivedRef.current = inRangeNow;

          if (nearestCheckable && nearestCheckableDist <= cfg.checkInRadiusM) {
            setZone({ status: 'in', name: nearestCheckable.name });
            setActiveTier(nearestCheckable.tier ?? 0);
            setHiddenDistance(null);
            currentHiddenIdRef.current = null;
            setHiddenSpot(null);
          } else if (nearestHidden && nearestHiddenDist <= cfg.hiddenRadiusM) {
            setZone({ status: 'hidden' });
            setActiveTier(nearestHidden.tier ?? 0);
            setHiddenDistance(Math.round(nearestHiddenDist));
            // Physically reaching the spot UNLOCKS it (persists on the map). Fire
            // ONCE per spot — guard against the per-second GPS ticks.
            if (currentHiddenIdRef.current !== nearestHidden.id) {
              currentHiddenIdRef.current = nearestHidden.id;
              storage.unlockLocation(nearestHidden.id);
              void recordUnlock(nearestHidden.id); // persist the unlock server-side
              void refresh(); // provider re-reads unlocked → map/home stop hiding it
              // Celebratory arrival push: fires once per spot (the ref guards it),
              // so reaching a hidden gem pings even if the user's screen is off.
              void fireArrivalNotification(nearestHidden.name);
              setHiddenSpot({ id: nearestHidden.id, name: nearestHidden.name, image: nearestHidden.imageUrls?.[0] });
            }
          } else if (nearestHidden && nearestHiddenDist <= cfg.warmRadiusM * tierRadiusBoost(level)) {
            setZone({ status: 'warm' });
            setActiveTier(0);
            setHiddenDistance(Math.round(nearestHiddenDist));
            currentHiddenIdRef.current = null;
            setHiddenSpot(null);
          } else {
            setZone({ status: 'out' });
            setActiveTier(0);
            setHiddenDistance(null);
            currentHiddenIdRef.current = null;
            setHiddenSpot(null);
          }
        };

        watchSub = await Location.watchPositionAsync(
          // Tight, continuous updates so the distance ticks down like a compass.
          // distanceInterval: 0 = don't gate on movement; report ~every second.
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0, timeInterval: 1000 },
          (pos) => evaluate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        );
        if (cancelled) {
          watchSub.remove();
          watchSub = null;
        }
      } catch {
        if (!cancelled) setZone({ status: 'out' });
      }
    })();
    return () => {
      cancelled = true;
      watchSub?.remove();
    };
  }, [isWeb, flow]);

  // Rainbow shimmer for the "hidden spot discovered" reveal sheet border.
  const rainbow = useRef(new Animated.Value(0)).current;

  // Shutter feedback mode — the Skia ShutterButton renders the actual glow:
  //   'warm'  = a hidden spot is near (rainbow), 'ready' = in range to check in
  //   (green), 'none' = plain white shutter.
  // Until the camera's own precise watch returns its first fix (zone 'checking'),
  // reflect the SHARED provider's hidden-nearby readout so the "something nearby"
  // bar + warm shutter appear INSTANTLY (consistent with home/map) instead of a
  // load gap. The precise local watch then takes over and is authoritative for the
  // in/hidden check-in gating — we never seed 'ready' from the coarse shared fix.
  const localFixReceived = zone.status !== 'checking';
  // Display zone: the "something nearby" warm teaser reflects EITHER the precise
  // local watch OR the shared provider readout — whichever currently senses a
  // hidden spot. This keeps the pink bar/warm shutter showing INSTANTLY on open
  // (consistent with home/map) AND stops it flickering off when the local watch's
  // first (often last-known) fix transiently disagrees before it recomputes. The
  // check-in READY states ('in'/'hidden') come ONLY from the precise local watch,
  // so a check-in is never enabled on the coarse shared fix.
  const localSensesHidden =
    zone.status === 'in' || zone.status === 'hidden' || zone.status === 'warm';
  const displayZoneStatus: typeof zone.status = localSensesHidden
    ? zone.status
    : hiddenWarm
      ? 'warm'
      : localFixReceived
        ? 'out'
        : 'checking';
  // Prefer the precise local distance when the local watch itself senses the spot;
  // otherwise fall back to the provider's distance so the readout matches the bar.
  const displayHiddenDistance =
    (zone.status === 'warm' || zone.status === 'hidden') && hiddenDistance != null
      ? hiddenDistance
      : hiddenWarm
        ? hiddenDistanceM
        : null;
  // A high-rarity spot you're in/on (Prized+, tier 4+) is a "gem", so the shutter
  // glows rainbow even when ready — a gem check-in stays special. activeTier comes
  // from the zone detection, so it works whether you tapped CHECK IN on the spot
  // or just walked into its zone with the camera opened from the tab.
  const activeIsGem = activeTier >= 4;
  const shutterMode: ShutterMode =
    flow !== 'capture'
      ? 'none'
      : displayZoneStatus === 'in' || displayZoneStatus === 'hidden'
        ? (activeIsGem ? 'gem' : 'ready')
        : displayZoneStatus === 'warm'
          ? 'warm'
          : 'none';

  const rainbowActive = flow === 'verified' && isDiscovery;
  useEffect(() => {
    if (!rainbowActive) return;
    const loop = Animated.loop(
      Animated.timing(rainbow, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, [rainbowActive, rainbow]);
  const rainbowColor = rainbow.interpolate({
    inputRange: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1],
    outputRange: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff3b30'],
  });

  const resetToCapture = useCallback(() => {
    processingRef.current = false;
    setPhotoUri(null);
    setPhotoExif(null);
    setMatchedLocation(null);
    setUpdatedUser(null);
    setPointsEarned(0);
    setIsDiscovery(false);
    setExplorerBonus(false);
    setErrorMessage('');
    setNewAchievements([]);
    setTooFar(null);
    setLocked(null);
    setFlow('capture');
  }, []);

  // Drag-down-to-dismiss for the full-screen "verified" takeover (mirrors the
  // explore detail sheet). Drag only claims when the inner ScrollView is at the
  // top; past a threshold it slides off and returns to the viewfinder.
  const verifiedTranslateY = useRef(new Animated.Value(0)).current;
  const verifiedScrollAtTop = useRef(true);
  const verifiedPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        verifiedScrollAtTop.current && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) verifiedTranslateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 130) {
          Animated.timing(verifiedTranslateY, {
            toValue: SCREEN_H,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            verifiedTranslateY.setValue(0);
            resetToCapture();
          });
        } else {
          Animated.spring(verifiedTranslateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    })
  ).current;
  // Clear any leftover drag offset whenever we (re)enter the verified takeover.
  useEffect(() => {
    if (flow === 'verified') verifiedTranslateY.setValue(0);
  }, [flow, verifiedTranslateY]);

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
    // Gate: only allow a capture when actually in check-in range. Tapping the
    // glowing-but-not-there shutter buzzes an error + nudges, instead of a doomed
    // photo → verify → "check-in failed" loop. (The web/simulate path is never gated.)
    const inRange = zone.status === 'in' || zone.status === 'hidden';
    if (!isWeb && cameraRef.current && !inRange) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // ignore
      }
      setNudge(true);
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      nudgeTimer.current = setTimeout(() => setNudge(false), 1800);
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics unsupported (e.g. web) — ignore.
    }
    if (isWeb || !cameraRef.current) {
      // Fallback: no native capture, use a placeholder so the flow can continue.
      setPhotoUri(null);
      setPhotoExif(null);
      setFlow('preview');
      return;
    }
    try {
      // Compress at capture: a full-resolution phone photo is several MB, which
      // is slow/unreliable to upload over the dev server (and can blow the
      // server's 10MB image limit). quality 0.5 keeps a clear verification photo
      // at a fraction of the size, so the multipart upload completes reliably.
      // exif: true returns the camera's EXIF tags (device, capture time, etc.) so
      // the check-in carries metadata the admin can use to verify it.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, exif: true });
      // Move the capture out of the clearable cache into permanent storage so the
      // local thumbnail + upload-retry survive app restarts (Android can purge
      // the camera cache uri at any time).
      const permanentUri = photo?.uri ? persistPhoto(photo.uri) : null;
      setPhotoUri(permanentUri);
      setPhotoExif(photo?.exif ?? null);
      setFlow('preview');
    } catch (e) {
      console.warn('Failed to capture photo', e);
      setPhotoUri(null);
      setPhotoExif(null);
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
    // Horizontal accuracy (m) of the fix above — recorded with the check-in for
    // admin verification. Only meaningful when `coords` resolved (same promise).
    let gpsAccuracy: number | null = null;
    try {
      coords = await Promise.race<Coordinates | null>([
        (async () => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return null;
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
          gpsAccuracy = pos.coords.accuracy ?? null;
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
    const cfg = getConfig();
    const level = verifyUser?.stats.currentLevel ?? 1;
    const maxTier = unlockedTier(level);
    // Floor tier ABOVE which a spot becomes hidden-discoverable (the rainbow band).
    // tier <= maxTier: normal · maxTier < tier <= discoveryFloor: HARD-LOCKED (level
    // up, no discovery) · tier > discoveryFloor: discoverable by PROXIMITY regardless
    // of how high the tier (no secret ceiling — remote epics are found by getting near).
    const discoveryFloor = maxTier + cfg.lockTeaserRange;

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
      ? locations.find((loc) => loc.id === targetLocationId) ?? null
      : null;

    // Separately, the nearest UNDISCOVERED hidden spot the user is standing on —
    // discovery only happens on-site (within range).
    let onsiteHidden: ExploreLocation | null = null;
    let onsiteHiddenDist = Infinity;
    const priorCheckIns = await storage.getCheckIns();
    const visited = new Set(priorCheckIns.map((c) => c.locationId));
    for (const loc of locations) {
      // No secret ceiling: any spot ABOVE the hard-lock teasers is discoverable by
      // proximity; tiers in maxTier+1..maxTier+LOCK_TEASER_RANGE stay hard-locked.
      const undiscoveredHidden = loc.tier > discoveryFloor && !visited.has(loc.id);
      if (!undiscoveredHidden) continue;
      const d = getDistance(coords, loc.coordinates);
      if (d <= cfg.checkInRadiusM && d < onsiteHiddenDist) {
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
      inRange = d <= cfg.checkInRadiusM;
      if (!inRange) {
        // #8: too far — do NOT record. Show a clear, branded distance state.
        setTooFar({ name: tapped.name, distance: d, radius: cfg.checkInRadiusM });
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
    // Explorer bonus: opted-in Nearby-Alerts users earn a multiplier on every
    // check-in (stacks on top of the first-find discovery bonus).
    const alertsBonus = storage.getNearbyAlertsEnabled() ? cfg.nearbyAlertsMultiplier : 1;
    const base = discovered ? target.points * cfg.discoveryMultiplier : target.points;
    const earned = Math.round(base * alertsBonus);

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
      gpsAccuracy,
      photoExif,
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
          gpsAccuracy,
          photoExif,
          verifiedOffline: false,
          checkedInAt: checkIn.timestamp,
        });
        if (uploaded.ok) {
          // Record the server id so this check-in can be deleted server-side later.
          if (uploaded.serverId != null) {
            await storage.setCheckInServerId(checkIn.id, uploaded.serverId);
          }
        } else {
          await storage.queueOfflineCheckIn(target.id, checkIn.photoUrl, coords, earned, { gpsAccuracy, photoExif });
        }
      } else {
        checkIn.verifiedOffline = true;
        await storage.addCheckIn(checkIn);
        await storage.queueOfflineCheckIn(target.id, checkIn.photoUrl, coords, earned, { gpsAccuracy, photoExif });
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
    // Let the shared provider pick up the new visited id + level/XP so home + map
    // reflect the check-in (and any newly-unlocked spot) BEFORE the user can leave
    // the reveal. Awaited (was fire-and-forget) so the map no longer momentarily
    // blanks the just-checked-in spot; forced past the staleness guard to re-sync
    // the server's authoritative unlocked/visited state. Online-only + guarded so a
    // network hiccup can't break the reward reveal (the map filter also falls back
    // to local visited/unlocked state).
    try {
      await refresh(isOnline ? { force: true } : undefined);
    } catch {
      // non-fatal — local state already reflects the check-in
    }
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
    setExplorerBonus(alertsBonus > 1);
    setNewAchievements(unlockedNow);
    setShowAllAchievements(false); // fresh reveal starts collapsed
    setPrevLevel(levelBefore);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // ignore
    }
    setFlow('verified');
  };

  // ----- Render helpers -----

  // Badge text/icon/colour use the DISPLAY zone (seeded from the shared provider
  // before the local fix), so "Something's hidden nearby" shows instantly instead
  // of "Scanning…". zone.name only exists on a precise 'in', so it's safe here.
  const zoneText =
    displayZoneStatus === 'in'
      ? zone.name
        ? `You're in the ${zone.name} zone! 🎯`
        : "You're in a check-in zone! 🎯"
      : displayZoneStatus === 'hidden'
        ? 'Hidden spot found — snap to claim it!'
        : displayZoneStatus === 'warm'
          ? "👀 Something's hidden nearby"
          : displayZoneStatus === 'out'
            ? 'No zone here — roam closer to a spot! 🧭'
            : 'Scanning for a zone…';
  const zoneIcon: keyof typeof Ionicons.glyphMap =
    displayZoneStatus === 'in'
      ? 'navigate-circle'
      : displayZoneStatus === 'hidden'
        ? 'sparkles'
        : displayZoneStatus === 'warm'
          ? 'search' // the "looking for it" magnifying glass (was a flame)
          : displayZoneStatus === 'out'
            ? 'compass-outline'
            : 'navigate-outline';

  // Temperature: the thermometer colour heats up (cool→hot) as the explorer
  // closes from WARM_RADIUS_M to 0. Shown only while approaching (warm); once
  // within range the bar flips to the "found it — claim it" state instead.
  const zonePillStyle =
    displayZoneStatus === 'in'
      ? styles.zonePillIn
      : displayZoneStatus === 'hidden'
        ? styles.zonePillHidden
        : displayZoneStatus === 'warm'
          ? styles.zonePillWarm
          : displayZoneStatus === 'out'
            ? styles.zonePillOut
            : styles.zonePillChecking;
  const zoneColor =
    displayZoneStatus === 'in' ? '#0f5132' : displayZoneStatus === 'hidden' ? '#fff' : Brand.ink;

  const renderCaptureControls = () => (
    <>
      {/* Top-center geofence status: in-zone, hidden-spot, warm, or nothing nearby.
          The hidden/warm states shimmer rainbow + show a temperature gauge. */}
      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        {zone.status === 'hidden' && hiddenSpot ? (
          // Reached + unlocked a hidden spot: a snapshot + a simple "unlocked,
          // check in now" prompt, with a link to view it on the map.
          <View style={[styles.unlockCard, stampBorder]}>
            {hiddenSpot.image ? (
              <Image source={{ uri: hiddenSpot.image }} style={styles.unlockThumb} />
            ) : (
              <View style={[styles.unlockThumb, styles.unlockThumbFallback]}>
                <Ionicons name="sparkles" size={20} color={Brand.purple} />
              </View>
            )}
            <View style={styles.unlockInfo}>
              <BrandText weight="bold" color={Brand.purple} style={styles.unlockKicker}>
                🌈 You found a hidden gem!
              </BrandText>
              <BrandText weight="bold" color={Brand.ink} style={styles.unlockName} numberOfLines={1}>
                {hiddenSpot.name}
              </BrandText>
              <View style={styles.unlockActions}>
                <BrandText weight="bold" color={Brand.purple} style={styles.unlockCheckin}>
                  Check in now
                </BrandText>
                <BrandText weight="bold" color={Brand.inkSubtle} style={styles.unlockDot}>·</BrandText>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/', params: { selectedId: hiddenSpot.id } })}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <BrandText weight="bold" color={Brand.inkSecondary} style={styles.unlockLink}>
                    View on map
                  </BrandText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : displayZoneStatus === 'warm' && displayHiddenDistance != null ? (
          <HiddenNearbyBar distance={displayHiddenDistance} />
        ) : (
          // Calm, nav-bar-sized pill for the in-zone / nothing-nearby states.
          <View style={[styles.zonePill, stampBorder, zonePillStyle]}>
            <Ionicons name={zoneIcon} size={16} color={zoneColor} />
            <BrandText weight="bold" style={[styles.zoneText, { color: zoneColor }]} numberOfLines={1}>
              {zoneText}
            </BrandText>
          </View>
        )}
      </SafeAreaView>

      {/* Bottom controls: centered white ring shutter, flash + flip on the right */}
      <View style={[styles.bottomBar, { paddingBottom: bottomPad }]} pointerEvents="box-none">
        {nudge && (
          <View style={styles.nudgePill} pointerEvents="none">
            <Ionicons name="walk" size={15} color="#fff" />
            <BrandText weight="bold" color="#fff" style={styles.nudgeText}>
              Get closer to take the shot
            </BrandText>
          </View>
        )}
        <View style={styles.shutterRow}>
          <View style={styles.sideSlot} />
          {/* Skia shutter: rainbow sweep + real blurred glow (warm), green (ready). */}
          <ShutterButton mode={shutterMode} onPress={handleShutter} />
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
    const canShowCamera = !isWeb && permission?.granted && isFocused;

    return (
      <View style={styles.fullScreen}>
        {canShowCamera ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />
        ) : (
          <View style={styles.fallback}>
            <Ionicons name="camera-outline" size={56} color="#9ca3af" />
            <BrandText weight="bold" color="#fff" style={styles.fallbackTitle}>
              {isWeb || (permission && !permission.granted) ? 'Camera not available' : 'Preparing camera…'}
            </BrandText>
            <BrandText weight="medium" color="#9ca3af" style={styles.fallbackText}>
              {isWeb
                ? 'Live camera is limited here. Simulate a check-in to continue.'
                : permission && !permission.granted
                  ? 'Camera permission is required to take a check-in photo.'
                  : 'Hang tight — getting the camera ready.'}
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

  // Preview / confirm state — the captured shot framed as a Polaroid. This makes
  // the two-step nature explicit: you've TAKEN the photo, now you're confirming
  // it's the one you'll check in with (no camera icon — you're not shooting again).
  if (flow === 'preview') {
    return (
      <View style={styles.fullScreen}>
        <FrozenPhoto />
        <View style={styles.previewScrim} />
        <SafeAreaView style={styles.previewContainer} edges={['top', 'bottom']}>
          {/* Discard + go back to the viewfinder */}
          <View style={styles.previewTopRow}>
            <TouchableOpacity style={styles.closeButton} onPress={resetToCapture} activeOpacity={0.8}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.previewCenter}>
            <BrandText weight="bold" color={Brand.surface} style={styles.previewHeading}>
              Use this shot?
            </BrandText>
            <BrandText weight="medium" color="rgba(255,255,255,0.82)" style={styles.previewSubheading}>
              This is the photo you&apos;ll check in with.
            </BrandText>

            {/* Polaroid frame — slight tilt + chin caption for a printed feel. */}
            <View style={styles.polaroid}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.polaroidPhoto} resizeMode="cover" />
              ) : (
                <View style={[styles.polaroidPhoto, styles.polaroidPlaceholder]}>
                  <Ionicons name="image-outline" size={56} color={Brand.inkSubtle} />
                </View>
              )}
              <View style={styles.polaroidCaption}>
                <Ionicons name="location" size={14} color={Brand.purple} />
                <BrandText weight="semibold" color={DARK_BROWN} style={styles.polaroidCaptionText} numberOfLines={1}>
                  {targetName || 'Your check-in'}
                </BrandText>
              </View>
            </View>
          </View>

          {/* Retake (back to camera) · Confirm check-in (→ verification) */}
          <View style={[styles.previewActions, { paddingBottom: bottomPad }]}>
            <TouchableOpacity
              style={[styles.retakeButton, stampBorder]}
              onPress={resetToCapture}
              activeOpacity={0.85}
            >
              <Ionicons name="camera-reverse-outline" size={20} color={Brand.ink} />
              <BrandText weight="bold" color={Brand.ink} style={styles.previewActionText}>Retake</BrandText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, stampBorder]}
              onPress={runVerification}
              disabled={processingRef.current}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={20} color={Brand.ink} />
              <BrandText weight="bold" color={Brand.ink} style={styles.previewActionText}>CHECK IN</BrandText>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Verifying state — instant feedback while GPS + storage run.
  if (flow === 'verifying') {
    return (
      <View style={styles.fullScreen}>
        <FrozenPhoto />
        <View style={styles.dimOverlay} />
        {/* Single centred verifying indicator (no duplicate bottom pill). */}
        <View style={styles.verifyingCenter} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <BrandText weight="bold" color="#fff" style={styles.verifyingText}>
            Verifying you&apos;re here…
          </BrandText>
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
              onPress={() => router.push('/')}
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
              onPress={() => router.push('/')}
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
          <Confetti />

          {/* Full-screen takeover — drag DOWN (from the top of the scroll) to
              dismiss back to the viewfinder. */}
          <Animated.View
            style={[styles.verifiedTakeover, { transform: [{ translateY: verifiedTranslateY }] }]}
            {...verifiedPan.panHandlers}
          >
            <Animated.View
              style={[styles.verifiedGlowWrap, isDiscovery && [styles.discoveryGlow, { borderColor: rainbowColor }]]}
            >
            <View style={[styles.verifiedCard, { paddingTop: insets.top }]}>
              <ScrollView
                style={styles.verifiedScroll}
                contentContainerStyle={styles.verifiedScrollContent}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  verifiedScrollAtTop.current = e.nativeEvent.contentOffset.y <= 0;
                }}
              >
              {/* Header section: drag handle + title */}
              <View style={styles.sheetSection}>
                <View style={styles.dragHandle} />
                <BrandText weight="bold" color={DARK_BROWN} style={styles.cardTitle}>
                  {isDiscovery ? 'Hidden spot discovered! 🌈' : 'Checked in!'}
                </BrandText>
                {isDiscovery && (
                  <BrandText weight="bold" color={Brand.purple} style={styles.discoveryBonus}>
                    {getConfig().discoveryMultiplier}× first-find bonus!
                  </BrandText>
                )}
                {explorerBonus && (
                  <BrandText weight="bold" color={Brand.purple} style={styles.discoveryBonus}>
                    +{Math.round((getConfig().nearbyAlertsMultiplier - 1) * 100)}% explorer bonus 🧭
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

              {/* Passport stamp — the rubber-stamp keepsake for this check-in. */}
              <View style={{ alignItems: 'center', marginTop: Spacing.two, marginBottom: Spacing.one }}>
                <PassportStamp
                  locationName={matchedLocation?.name ?? targetName ?? 'Unknown spot'}
                  dateISO={new Date().toISOString()}
                  status={isDiscovery ? 'Discovered' : explorerBonus ? 'Explorer' : 'Checked In'}
                />
              </View>

              {/* XP / level progress section: badges flanking the bar */}
              {stats && (
                <View style={styles.sheetSection}>
                  <BrandText weight="bold" color={Brand.sticker.pink} style={styles.xpGainLabel}>
                    + {pointsEarned} XP
                  </BrandText>
                  <LevelUpBar
                    fromLevel={leveledUp ? prevLevel : stats.currentLevel}
                    toLevel={stats.currentLevel}
                    startFraction={0}
                    endFraction={progressPct / 100}
                  />
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
                  {(showAllAchievements ? newAchievements : newAchievements.slice(0, 3)).map((ach) => (
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
                  {newAchievements.length > 3 && (
                    <TouchableOpacity
                      style={styles.achToggle}
                      onPress={() => setShowAllAchievements((v) => !v)}
                      activeOpacity={0.8}
                    >
                      <BrandText weight="bold" color={Brand.purple} style={styles.achToggleText}>
                        {showAllAchievements
                          ? 'Show less'
                          : `Show ${newAchievements.length - 3} more`}
                      </BrandText>
                      <Ionicons
                        name={showAllAchievements ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={Brand.purple}
                      />
                    </TouchableOpacity>
                  )}
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
              <View style={[styles.sheetActionSection, { paddingBottom: bottomPad }]}>
                <TouchableOpacity style={[styles.purpleButton, stampBorder]} onPress={() => router.push('/')} activeOpacity={0.85}>
                  <Ionicons name="map-outline" size={18} color={Brand.bg} />
                  <BrandText weight="bold" color={Brand.bg} style={styles.purpleButtonText}>BACK TO MAP</BrandText>
                </TouchableOpacity>
              </View>
            </View>
            </Animated.View>
            {/* X close — returns to the camera viewfinder (NOT the map). */}
            <SafeAreaView style={styles.topBarLeft} edges={['top']} pointerEvents="box-none">
              <TouchableOpacity style={styles.closeButton} onPress={resetToCapture} activeOpacity={0.8}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </SafeAreaView>
          </Animated.View>
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
    flexDirection: 'column',
    // Floating full-width bar with 16px side margins to match the nav bar.
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: Spacing.two,
  },
  // Compact, full-width status bar at the top of the viewfinder.
  // Wrapper lets the glow halo sit behind the bar (full-width floating bar).
  // Fully-rounded, nav-bar-sized status pill (calm — no animation here).
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: BrandRadius.pill,
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
    flex: 1,
    fontSize: 14,
    color: Brand.ink,
  },
  zoneTextIn: {
    color: '#0f5132',
  },
  // Temperature + live distance as a readable dark chip on the right of the bar.
  // Plain, clean distance readout on the right of the bar (no icon, no chip).
  heatValue: {
    fontSize: 13,
    color: Brand.ink,
  },
  // "You've unlocked X" card — shown when standing within range of a hidden spot.
  unlockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    backgroundColor: Brand.surface,
    borderRadius: BrandRadius.sticker,
    padding: Spacing.two,
  },
  unlockThumb: {
    width: 46,
    height: 46,
    borderRadius: BrandRadius.control,
    backgroundColor: Brand.bg,
  },
  unlockThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockInfo: {
    flex: 1,
    gap: 1,
  },
  unlockKicker: {
    fontSize: 11,
  },
  unlockName: {
    fontSize: 15,
  },
  unlockActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  unlockCheckin: {
    fontSize: 12,
  },
  unlockDot: {
    fontSize: 12,
  },
  unlockLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
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
  // Transient "get closer" nudge above the shutter when tapped out of range.
  nudgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(20,16,14,0.82)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: BrandRadius.pill,
    marginBottom: Spacing.three,
  },
  nudgeText: {
    fontSize: 13,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The rainbow fill IS a circle (borderRadius on the gradient itself), so it
  // stays round when rotated — Android won't clip a transformed child to a
  // parent's rounded corners, which was the "square overlay" bug.
  shutterGradient: {
    flex: 1,
    borderRadius: 999,
  },
  // Soft circular glow behind the shutter. The fill carries the borderRadius so
  // it's always round even while the wrapper scales (no square bleed).
  shutterGlow: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
  },
  shutterGlowFill: {
    flex: 1,
    borderRadius: 999,
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

  // ── Polaroid preview / confirm step ──
  previewScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,16,14,0.8)',
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  previewTopRow: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  previewCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  previewHeading: {
    fontSize: 22,
    textAlign: 'center',
  },
  previewSubheading: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: Spacing.four,
  },
  polaroid: {
    backgroundColor: Brand.surface,
    padding: 12,
    paddingBottom: 16,
    borderRadius: 6,
    transform: [{ rotate: '-2deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 14,
  },
  polaroidPhoto: {
    width: SCREEN_W * 0.66,
    height: SCREEN_W * 0.66,
    borderRadius: 2,
    backgroundColor: Brand.bg,
  },
  polaroidPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  polaroidCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 14,
    paddingBottom: 2,
  },
  polaroidCaptionText: {
    fontSize: 14,
    maxWidth: SCREEN_W * 0.5,
  },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.surface,
    paddingVertical: Spacing.three,
    borderRadius: BrandRadius.pill,
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.teal,
    paddingVertical: Spacing.three,
    borderRadius: BrandRadius.pill,
  },
  previewActionText: {
    fontSize: 15,
    letterSpacing: 0.4,
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
  // Full-screen verified/discovery takeover (above the dimmed photo, zIndex 40).
  verifiedTakeover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  verifiedGlowWrap: {
    flex: 1,
  },
  verifiedCard: {
    flex: 1,
    backgroundColor: CREAM,
    overflow: 'hidden',
  },
  verifiedScroll: {
    flexShrink: 1,
  },
  verifiedScrollContent: {
    paddingBottom: 0,
  },
  // Animated rainbow glow framing the whole takeover when a hidden spot is found.
  discoveryGlow: {
    borderWidth: 3,
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
  // "Show N more / Show less" toggle under the first 3 achievements.
  achToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  achToggleText: {
    fontSize: 13,
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
