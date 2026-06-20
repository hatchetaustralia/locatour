import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Platform,
  Dimensions,
  FlatList,
  ScrollView,
  Animated,
  PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandText } from '@/components/brand';
import { Brand, Spacing, stampBorder, BrandRadius } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { unlockedTier } from '@/utils/leveling';
import { formatDistance, openDirections } from '@/utils/geo';
import { ExploreLocation, CheckIn } from '@/types';

// Native Map imports (conditionally rendered)
let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  try {
    const RNMaps = require('react-native-maps');
    MapView = RNMaps.default;
    Marker = RNMaps.Marker;
  } catch (e) {
    console.error('Failed to import react-native-maps', e);
  }
}

// Custom Map Skin — warm cream/paper tones to match the brand aesthetic.
const LIGHT_MAP_STYLE = [
  { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#FCF0E8' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#dcefdf' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#bfe6e9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#fffdfb' }] },
];

// "3rd March 2024" style date — matches the Previous Check-ins design.
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

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const searchParams = useLocalSearchParams<{ selectedId?: string }>();

  const [locations, setLocations] = useState<ExploreLocation[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<ExploreLocation | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [visitedLogs, setVisitedLogs] = useState<CheckIn[]>([]);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [activeSlide, setActiveSlide] = useState(0);
  // Standard vs satellite (hybrid) basemap. Online-only for now; offline tiles
  // are a future MapLibre migration (see docs/locatour/02-map-stack-decision.md).
  const [satellite, setSatellite] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Drag-to-dismiss for the detail sheet: panning the grabber down past a
  // threshold slides it away and clears the selection (a native bottom-sheet feel).
  const translateY = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 110) {
          Animated.timing(translateY, { toValue: 600, duration: 180, useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            setSelectedLoc(null);
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    })
  ).current;

  // Initial data load
  useEffect(() => {
    async function init() {
      // Tier-gate locations by the user's level: only show tiers they've
      // unlocked (spec 06). Locked locations are simply hidden for now.
      const [allLocs, user] = await Promise.all([
        storage.getLocations(),
        storage.getUser(),
      ]);
      const maxTier = unlockedTier(user?.stats.currentLevel ?? 1);
      const locs = allLocs.filter((l) => l.tier <= maxTier);
      setLocations(locs);

      const checkins = await storage.getCheckIns();
      setVisitedLogs(checkins);

      // Handle query parameter trigger
      if (searchParams.selectedId) {
        const found = locs.find((l) => l.id === searchParams.selectedId);
        if (found) setSelectedLoc(found);
      }

      // Request GPS permissions
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation(loc);
        }
      } catch (e) {
        console.warn('GPS permission denied or failed to retrieve coordinates', e);
      }
    }
    init();
  }, [searchParams.selectedId]);

  const handleMarkerSelect = async (loc: ExploreLocation) => {
    translateY.setValue(0);
    setSelectedLoc(loc);
    setActiveSlide(0);
    // Reload check-ins
    const checkins = await storage.getCheckIns();
    setVisitedLogs(checkins);
  };

  const getPinColor = (category: string) => {
    switch (category) {
      case 'parks':
        return Brand.sticker.green;
      case 'scenic':
        return Brand.teal;
      case 'food':
        return Brand.sticker.gold;
      default:
        return Brand.sticker.purple;
    }
  };

  const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    switch (category) {
      case 'parks':
        return 'leaf';
      case 'scenic':
        return 'camera';
      case 'food':
        return 'restaurant';
      default:
        return 'compass';
    }
  };

  const getCheckInStatus = (locationId: string) => {
    const entries = visitedLogs.filter((c) => c.locationId === locationId);
    if (entries.length === 0) return null;
    // Get latest check-in
    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
  };

  // All check-ins for the selected location, newest first — feeds the
  // "Previous Check-ins" sub-tab (read-only, reuses storage data).
  const getCheckInsForLocation = (locationId: string) => {
    return visitedLogs
      .filter((c) => c.locationId === locationId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  // Coordinates mathematical Haversine check for UI helpers
  const getDistanceToLocation = (locCoords: { latitude: number; longitude: number }) => {
    if (!userLocation) return null;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(locCoords.latitude - userLocation.coords.latitude);
    const dLon = toRad(locCoords.longitude - userLocation.coords.longitude);
    const lat1 = toRad(userLocation.coords.latitude);
    const lat2 = toRad(locCoords.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // distance in meters
    return Math.round(d);
  };

  // Brand-styled map pin: rounded badge with a dark stamp border. Checked-in
  // locations get a gold XP badge; not-yet-visited show the category icon.
  const renderPinBadge = (loc: ExploreLocation, isSelected: boolean) => {
    const checkedIn = !!getCheckInStatus(loc.id);
    return (
      <View style={styles.pinWrapper}>
        <View
          style={[
            styles.pinBubble,
            stampBorder,
            {
              backgroundColor: checkedIn ? Brand.ink : getPinColor(loc.category),
              transform: [{ scale: isSelected ? 1.18 : 1 }],
            },
          ]}
        >
          {checkedIn ? (
            <Ionicons name="checkmark" size={16} color={Brand.bg} />
          ) : (
            <Ionicons name={getCategoryIcon(loc.category)} size={15} color={Brand.ink} />
          )}
        </View>
        {/* Gold XP badge floating on the pin */}
        <View style={[styles.xpBadge, stampBorder, styles.xpBadgeBorder]}>
          <Ionicons name="trophy" size={9} color="#b46c00" />
          <BrandText weight="bold" style={styles.xpBadgeText}>
            +{loc.points}
          </BrandText>
        </View>
        <View style={[styles.pinArrow, { borderTopColor: Brand.ink }]} />
      </View>
    );
  };

  const selectedCheckIns = selectedLoc ? getCheckInsForLocation(selectedLoc.id) : [];
  const selectedLatest = selectedLoc ? getCheckInStatus(selectedLoc.id) : null;
  // 24h re-check-in cooldown (spec 06): null when checkable, else the Date it's
  // available again. Drives the disabled CHECK IN state on the detail sheet.
  const cooldownUntil = selectedLoc ? storage.nextCheckInAt(selectedLoc.id) : null;
  const cooldownHoursLeft = cooldownUntil
    ? Math.max(1, Math.ceil((cooldownUntil.getTime() - Date.now()) / (60 * 60 * 1000)))
    : 0;

  return (
    <View style={styles.container}>
      {/* Announcement Overlay Banner — gold stamp card with dismiss */}
      {showAnnouncement && (
        <View style={[styles.announcement, stampBorder]}>
          <BrandText weight="semibold" style={styles.announcementText}>
            Here&apos;s a useful announcement!
          </BrandText>
          <TouchableOpacity
            onPress={() => setShowAnnouncement(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={Brand.ink} />
          </TouchableOpacity>
        </View>
      )}

      {/* Map View Section */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' || !MapView ? (
          // Web styled paper-map mockup (web has no native map; satellite just
          // tints the mockup darker so the toggle is demonstrable here)
          <View style={[styles.webMapBackground, satellite && styles.webMapSatellite]}>
            <View style={styles.webLake} />
            <View style={styles.webPark} />

            {/* Custom Interactive Pins */}
            {locations.map((loc) => {
              const isSelected = selectedLoc?.id === loc.id;
              // Map lat/long to absolute pixel values roughly centered around Perth coordinates
              const leftVal = 100 + (loc.coordinates.longitude - 115.8291) * 3000;
              const topVal = 200 - (loc.coordinates.latitude - -31.9472) * 3000;

              return (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.webMarker, { left: leftVal, top: topVal }]}
                  onPress={() => handleMarkerSelect(loc)}
                >
                  {renderPinBadge(loc, isSelected)}
                </TouchableOpacity>
              );
            })}

            <View style={styles.webMapHint}>
              <BrandText weight="medium" style={styles.webMapHintText}>
                Interactive map preview
              </BrandText>
            </View>
          </View>
        ) : (
          // Native react-native-maps rendering
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: -31.953,
              longitude: 115.845,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            mapType={satellite ? 'hybrid' : 'standard'}
            customMapStyle={satellite ? undefined : LIGHT_MAP_STYLE}
            showsUserLocation
            showsMyLocationButton
          >
            {locations.map((loc) => (
              <Marker
                key={loc.id}
                coordinate={loc.coordinates}
                onPress={() => handleMarkerSelect(loc)}
              >
                {renderPinBadge(loc, selectedLoc?.id === loc.id)}
              </Marker>
            ))}
          </MapView>
        )}

        {/* Standard / satellite toggle (top-right over the map) */}
        <TouchableOpacity
          style={[styles.mapTypeToggle, stampBorder]}
          onPress={() => setSatellite((s) => !s)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={satellite ? 'map' : 'globe-outline'}
            size={18}
            color={Brand.ink}
          />
          <BrandText weight="bold" color={Brand.ink} style={styles.mapTypeToggleText}>
            {satellite ? 'Standard' : 'Satellite'}
          </BrandText>
        </TouchableOpacity>
      </View>

      {/* Location detail sheet — draggable cream stamp card above the tab bar */}
      {selectedLoc && (
        <View
          style={[
            styles.sheetOverlay,
            { bottom: Platform.OS === 'web' ? Spacing.six + 20 : 0 },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.bottomSheet, stampBorder, { transform: [{ translateY }] }]}>
            {/* Grabber + title — drag down to dismiss (no close cross) */}
            <View style={styles.sheetGrabber} {...pan.panHandlers}>
              <View style={styles.dragHandle} />
              <View style={styles.sheetTitleRow}>
                <BrandText weight="semibold" style={styles.sheetTitle} numberOfLines={1}>
                  {selectedLoc.name}
                </BrandText>
                {selectedLatest && <Ionicons name="checkmark-circle" size={20} color={Brand.purple} />}
              </View>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Photo Carousel */}
              <View style={styles.carouselWrapper}>
                <FlatList
                  ref={flatListRef}
                  data={selectedLoc.imageUrls}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_item, index) => index.toString()}
                  onScroll={(e) => {
                    const slide = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_WIDTH);
                    setActiveSlide(slide);
                  }}
                  renderItem={({ item }) => <Image source={{ uri: item }} style={styles.carouselImage} />}
                />
                {selectedLoc.imageUrls.length > 1 && (
                  <View style={styles.paginationRow}>
                    {selectedLoc.imageUrls.map((_, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.paginationDot,
                          { backgroundColor: idx === activeSlide ? Brand.purple : Brand.inkSubtle },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>

              {/* XP & Distance stats */}
              <View style={styles.statsRow}>
                <View style={[styles.statPill, styles.xpStatPill]}>
                  <Ionicons name="trophy" size={14} color="#b46c00" />
                  <BrandText weight="bold" style={styles.xpStatText}>
                    {selectedLoc.points} Points
                  </BrandText>
                </View>
                {userLocation && (
                  <View style={[styles.statPill, styles.distStatPill]}>
                    <Ionicons name="location" size={14} color={Brand.ink} />
                    <BrandText weight="semibold" style={styles.distStatText}>
                      {formatDistance(getDistanceToLocation(selectedLoc.coordinates))} away
                    </BrandText>
                  </View>
                )}
              </View>

              {/* Universal get-directions — Apple Maps on iOS, Google/geo on Android */}
              <TouchableOpacity
                style={[styles.directionsBtn, stampBorder]}
                onPress={() =>
                  openDirections(
                    selectedLoc.coordinates.latitude,
                    selectedLoc.coordinates.longitude,
                    selectedLoc.name
                  )
                }
                activeOpacity={0.85}
              >
                <Ionicons name="navigate" size={16} color={Brand.ink} />
                <BrandText weight="bold" color={Brand.ink} style={styles.directionsBtnText}>
                  Get directions
                </BrandText>
              </TouchableOpacity>

              {/* Address */}
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={16} color={Brand.purple} />
                <BrandText weight="medium" color={Brand.inkSecondary} style={styles.addressText}>
                  {selectedLoc.address}
                </BrandText>
              </View>

              {/* Description */}
              <BrandText weight="medium" color={Brand.inkSecondary} style={styles.descriptionText}>
                {selectedLoc.description}
              </BrandText>

              {/* Previous check-ins — only once some exist, at the bottom of the card */}
              {selectedCheckIns.length > 0 && (
                <View style={styles.historySection}>
                  <BrandText weight="semibold" style={styles.historyHeading}>
                    Previous check-ins
                  </BrandText>
                  {selectedCheckIns.map((entry) => (
                    <View key={entry.id} style={[styles.historyCard, stampBorder, styles.historyCardBorder]}>
                      <Image
                        source={{ uri: entry.photoUrl || selectedLoc.imageUrls[0] }}
                        style={styles.historyThumb}
                      />
                      <View style={styles.historyInfo}>
                        <View style={styles.historyMetaRow}>
                          <Ionicons name="calendar-outline" size={15} color={Brand.ink} />
                          <BrandText weight="medium" style={styles.historyDate}>
                            {formatDate(entry.timestamp)}
                          </BrandText>
                        </View>
                        <View style={styles.historyMetaRow}>
                          <Ionicons name="time-outline" size={15} color={Brand.inkSecondary} />
                          <BrandText weight="medium" color={Brand.inkSecondary} style={styles.historyTime}>
                            {formatTime(entry.timestamp)}
                          </BrandText>
                        </View>
                        <View style={styles.historyMetaRow}>
                          <Ionicons name="trophy-outline" size={15} color="#e59824" />
                          <BrandText weight="medium" style={styles.historyPoints}>
                            {entry.pointsEarned} Points
                          </BrandText>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* CHECK IN Action CTA — purple stamp button. Disabled within the
                24h re-check-in cooldown window (spec 06). Bottom padding clears
                the floating pill nav. */}
            <View style={[styles.ctaWrapper, { paddingBottom: insets.bottom + 72 }]}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!!cooldownUntil}
                style={[styles.checkInBtn, stampBorder, cooldownUntil && styles.checkInBtnDisabled]}
                onPress={() =>
                  router.push({
                    pathname: '/camera',
                    params: { locationId: selectedLoc.id, points: selectedLoc.points },
                  })
                }
              >
                <Ionicons name={cooldownUntil ? 'time-outline' : 'camera'} size={18} color={Brand.bg} />
                <BrandText weight="bold" color={Brand.bg} style={styles.checkInBtnText}>
                  {cooldownUntil ? `AVAILABLE IN ${cooldownHoursLeft}H` : 'CHECK IN'}
                </BrandText>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// Full-width sheet: carousel spans the window minus the scroll content's padding.
const CAROUSEL_WIDTH = Dimensions.get('window').width - Spacing.three * 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.bg,
    position: 'relative',
  },

  // Announcement banner
  announcement: {
    position: 'absolute',
    top: Platform.OS === 'web' ? Spacing.three : 52,
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Brand.sticker.gold,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  announcementText: {
    flex: 1,
    fontSize: 13,
    color: Brand.ink,
  },

  // Map
  mapContainer: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapTypeToggle: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 72 : 96,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Brand.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    zIndex: 20,
  },
  mapTypeToggleText: {
    fontSize: 12,
  },
  webMapBackground: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Brand.bg,
  },
  webMapSatellite: {
    backgroundColor: '#2f3a2c',
  },
  webLake: {
    position: 'absolute',
    width: 250,
    height: 150,
    borderRadius: 75,
    top: '35%',
    left: '40%',
    backgroundColor: '#bfe6e9',
  },
  webPark: {
    position: 'absolute',
    width: 300,
    height: 250,
    top: '10%',
    left: '10%',
    borderRadius: 30,
    backgroundColor: '#dcefdf',
  },
  webMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  webMapHint: {
    position: 'absolute',
    bottom: Spacing.six + 10,
    alignSelf: 'center',
    backgroundColor: Brand.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    ...stampBorder,
    borderRadius: BrandRadius.pill,
  },
  webMapHintText: {
    fontSize: 12,
    color: Brand.inkSecondary,
  },

  // Map pin
  pinWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
  },
  pinBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpBadge: {
    position: 'absolute',
    top: 0,
    right: -14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ffdf34',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  xpBadgeBorder: {
    borderColor: '#ffae34',
    borderRadius: BrandRadius.pill,
  },
  xpBadgeText: {
    fontSize: 9,
    color: '#b46c00',
  },
  pinArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },

  // Sheet
  sheetOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'web' ? Spacing.six + 20 : 0,
    top: 0,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    marginHorizontal: 0,
    marginBottom: 0,
    backgroundColor: Brand.bg,
    borderTopLeftRadius: BrandRadius.sticker,
    borderTopRightRadius: BrandRadius.sticker,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  // Draggable grabber zone (handle + title) at the top of the sheet.
  sheetGrabber: {
    alignItems: 'center',
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,36,33,0.1)',
  },
  dragHandle: {
    width: 44,
    height: 4,
    borderRadius: BrandRadius.pill,
    backgroundColor: 'rgba(42,36,33,0.22)',
    marginBottom: Spacing.two,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  sheetScroll: {
    flexShrink: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.teal,
    paddingVertical: Spacing.two + 2,
    borderRadius: BrandRadius.control,
    marginBottom: Spacing.three,
  },
  directionsBtnText: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  historySection: {
    marginTop: Spacing.two,
    gap: Spacing.one + 2,
  },
  historyHeading: {
    fontSize: 14,
    color: Brand.ink,
    marginBottom: Spacing.one,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,36,33,0.1)',
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  sheetTitle: {
    fontSize: 18,
    color: Brand.ink,
    flexShrink: 1,
  },
  closeButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(42,36,33,0.1)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    marginBottom: -2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Brand.purple,
  },
  tabText: {
    fontSize: 14,
  },

  // Sheet body
  sheetBody: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    flexShrink: 1,
  },

  // Carousel
  carouselWrapper: {
    position: 'relative',
    height: 150,
    borderRadius: BrandRadius.control,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  carouselImage: {
    width: CAROUSEL_WIDTH,
    height: 150,
    borderRadius: BrandRadius.control,
    backgroundColor: Brand.surface,
  },
  paginationRow: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(252,240,232,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BrandRadius.pill,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: BrandRadius.pill,
    gap: 4,
  },
  xpStatPill: {
    backgroundColor: '#ffdf34',
    borderWidth: 1,
    borderColor: '#ffae34',
  },
  xpStatText: {
    fontSize: 12,
    color: '#b46c00',
  },
  distStatPill: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: 'rgba(42,36,33,0.15)',
  },
  distStatText: {
    fontSize: 12,
    color: Brand.ink,
  },

  // Address + description
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.three,
  },
  visitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(129,65,220,0.08)',
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: BrandRadius.control,
    gap: Spacing.one,
    marginBottom: Spacing.three,
    alignSelf: 'flex-start',
  },
  visitedText: {
    fontSize: 12,
    color: Brand.purple,
  },

  // History tab
  emptyHistory: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  emptyHistoryText: {
    fontSize: 13,
    textAlign: 'center',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    backgroundColor: '#fffdfb',
    borderRadius: BrandRadius.control,
    padding: Spacing.one + 4,
    marginBottom: Spacing.one + 2,
  },
  historyCardBorder: {
    borderColor: 'rgba(42,36,33,0.2)',
  },
  historyThumb: {
    width: 80,
    height: 100,
    borderRadius: BrandRadius.control,
    backgroundColor: Brand.surface,
  },
  historyInfo: {
    flex: 1,
    gap: Spacing.two,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  historyDate: {
    fontSize: 14,
    color: Brand.ink,
  },
  historyTime: {
    fontSize: 14,
  },
  historyPoints: {
    fontSize: 14,
    color: '#e59824',
  },

  // CTA
  ctaWrapper: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,36,33,0.1)',
  },
  checkInBtn: {
    backgroundColor: Brand.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: BrandRadius.control,
    gap: Spacing.one + 2,
  },
  checkInBtnDisabled: {
    backgroundColor: Brand.inkSubtle,
    opacity: 0.85,
  },
  checkInBtnText: {
    fontSize: 13,
    letterSpacing: 0.65,
  },
});
