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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandText } from '@/components/brand';
import { Brand, BrandFonts, BrandRadius, stampBorder, Spacing } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { unlockedTier, maxDiscoverableTier, DISCOVERY_MULTIPLIER, WARM_RADIUS_M } from '@/utils/leveling';
import { ExploreLocation, CheckIn, User, Coordinates } from '@/types';

// --- Tuning flags ---
// Real-world proximity threshold for a valid check-in.
const CHECK_IN_RADIUS_M = 50;
// Dev/simulator override: mock Perth coordinates rarely land within 50m of a seeded
// location, so fall back to "nearest location regardless" to keep the demo working.
const DEV_IGNORE_RADIUS = true;
// Mock verification duration (later this becomes a real server call).
const VERIFY_DURATION_MS = 1800;

// On web the tab bar floats (position: absolute) over screen content; on native
// NativeTabs reserves that space. Lift the camera's bottom controls above it on web.
const WEB_TABBAR_CLEARANCE = Platform.OS === 'web' ? 96 : 0;

// State machine for the check-in flow.
type FlowState = 'capture' | 'preview' | 'verifying' | 'verified' | 'error';

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
    setPhotoUri(null);
    setMatchedLocation(null);
    setUpdatedUser(null);
    setPointsEarned(0);
    setIsDiscovery(false);
    setErrorMessage('');
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
      const photo = await cameraRef.current.takePictureAsync();
      setPhotoUri(photo?.uri ?? null);
      setFlow('preview');
    } catch (e) {
      console.warn('Failed to capture photo', e);
      setPhotoUri(null);
      setFlow('preview');
    }
  };

  const toggleFlash = () => setFlash((f) => (f === 'off' ? 'on' : 'off'));
  const flipCamera = () => setFacing((f) => (f === 'back' ? 'front' : 'back'));

  // Run the (mocked) proximity verification + persist the check-in.
  const runVerification = async () => {
    setFlow('verifying');

    // 1. Get current position. Skip on web (the browser permission prompt can
    // block indefinitely in headless/embedded contexts and coords aren't needed
    // for the mock). On native, race the whole permission+fix against a timeout
    // so a slow/never-resolving GPS can't stall the check-in (falls back to null).
    let coords: Coordinates | null = null;
    if (!isWeb) {
      try {
        coords = await Promise.race<Coordinates | null>([
          (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return null;
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          })(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
      } catch (e) {
        console.warn('Failed to get location for verification', e);
      }
    }

    // 2. Mock server delay.
    await new Promise((r) => setTimeout(r, VERIFY_DURATION_MS));

    // 3. Find the nearest DISCOVERABLE location (unlocked OR within the hidden
    // range). Secret tiers (beyond the range) are never matched, so they're never
    // leaked — a first check-in at a hidden spot becomes a discovery (step 4).
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
    const matchable = locations.filter((loc) => loc.tier <= maxDisc);

    let target: ExploreLocation | null = null;
    if (coords) {
      let nearestDist = Infinity;
      for (const loc of matchable) {
        const d = getDistance(coords, loc.coordinates);
        const inRange = d <= (loc.geofenceRadius ?? CHECK_IN_RADIUS_M) || DEV_IGNORE_RADIUS;
        if (inRange && d < nearestDist) {
          nearestDist = d;
          target = loc;
        }
      }
    } else if (DEV_IGNORE_RADIUS) {
      target = matchable[0] ?? null;
    }

    if (!target) {
      setErrorMessage("You're not close enough to any check-in spot.");
      setFlow('error');
      return;
    }

    // 3b. Enforce the 24h per-location re-check-in cooldown (spec 06). If the
    // user checked in here less than CHECKIN_COOLDOWN_H ago, block with a
    // "available again in Xh" message.
    const readyAt = storage.nextCheckInAt(target.id);
    if (readyAt) {
      const hoursLeft = Math.max(1, Math.ceil((readyAt.getTime() - Date.now()) / (60 * 60 * 1000)));
      setErrorMessage(
        `You've already checked in at ${target.name}. It will be available again in ${hoursLeft}h.`
      );
      setFlow('error');
      return;
    }

    // 4. Discovery? A first-ever check-in at a hidden (locked-tier) spot earns the
    // one-time discovery bonus (DISCOVERY_MULTIPLIER) and the rainbow treatment.
    const priorCheckIns = await storage.getCheckIns();
    const discovered = target.tier > maxTier && !priorCheckIns.some((c) => c.locationId === target.id);
    const earned = discovered ? target.points * DISCOVERY_MULTIPLIER : target.points;

    // 5. Build + persist the check-in.
    const checkInCoords: Coordinates = coords ?? target.coordinates;
    const checkIn: CheckIn = {
      id: 'checkin_' + Math.random().toString(36).slice(2, 11),
      userId: verifyUser?.uid ?? 'anonymous',
      locationId: target.id,
      photoUrl: photoUri ?? target.imageUrls[0],
      pointsEarned: earned,
      timestamp: new Date().toISOString(),
      coordinatesChecked: checkInCoords,
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
      } else {
        checkIn.verifiedOffline = true;
        await storage.queueOfflineCheckIn(target.id, checkIn.photoUrl, checkInCoords, earned);
      }
    } catch (e) {
      // Backstop (e.g. the storage tier-gate) — surface instead of hanging.
      setErrorMessage(e instanceof Error ? e.message : 'Could not record the check-in.');
      setFlow('error');
      return;
    }

    // 5. Re-fetch user for fresh XP/level stats.
    const fresh = await storage.getUser();

    setMatchedLocation(target);
    setUpdatedUser(fresh);
    setPointsEarned(earned);
    setIsDiscovery(discovered);

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
          <TouchableOpacity style={[styles.pillCheckIn, stampBorder]} onPress={runVerification} activeOpacity={0.85}>
            <Ionicons name="camera" size={20} color={Brand.ink} />
            <BrandText weight="bold" color={Brand.ink} style={styles.pillText}>CHECK IN</BrandText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Verifying state.
  if (flow === 'verifying') {
    return (
      <View style={styles.fullScreen}>
        <FrozenPhoto />
        <View style={styles.dimOverlay} />
        <View style={[styles.bottomBar, { paddingBottom: bottomPad }]} pointerEvents="box-none">
          <View style={[styles.pillCheckIn, styles.pillVerifying, stampBorder]}>
            <ActivityIndicator size="small" color={Brand.ink} />
            <BrandText weight="bold" color={Brand.ink} style={styles.pillText}>VERIFYING</BrandText>
          </View>
        </View>
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

              {/* BACK TO MAP — purple stamp button, right-aligned */}
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
