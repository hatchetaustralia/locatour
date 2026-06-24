/**
 * LocationLoadingBar — a transient "something's happening" status bar pinned to
 * the top of the screen while the app acquires GPS or pulls nearby locations.
 *
 * Driven entirely by LocationContext (locating || locationsLoading): it fades in
 * the moment a fetch/fix starts and fades out once both settle, so the user is
 * never left staring at an empty/stale map wondering if it's working. Mounted on
 * Home and Map. pointerEvents="none" so it never eats taps.
 *
 * Each screen passes a `topOffset` to clear its own header (Home has a logo bar;
 * the Map is full-bleed so it passes 0).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, Easing, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocationContext } from '@/context/location-context';
import { BrandText } from '@/components/brand';
import { Brand, BrandRadius, Spacing, stampBorder } from '@/constants/theme';

const TRACK_W = Dimensions.get('window').width;
const CHUNK = TRACK_W * 0.4;

export function LocationLoadingBar({ topOffset = 0 }: { topOffset?: number }) {
  const insets = useSafeAreaInsets();
  const { locating, locationsLoading } = useLocationContext();
  const active = locating || locationsLoading;

  // Keep the bar mounted through its fade-out, then drop it from the tree.
  const [mounted, setMounted] = useState(active);
  const opacity = useRef(new Animated.Value(active ? 1 : 0)).current;
  const slide = useRef(new Animated.Value(-CHUNK)).current;

  // Indeterminate sweep — a highlight chunk slides across the track on a loop.
  // Gated on `active` too so the loop stops the instant a fade-out begins (it'd
  // otherwise keep running invisibly until unmount).
  useEffect(() => {
    if (!mounted || !active) return;
    slide.setValue(-CHUNK);
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: TRACK_W,
        duration: 1150,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [mounted, active, slide]);

  // Fade in on start; fade out + unmount when both signals settle.
  useEffect(() => {
    if (active) {
      setMounted(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [active, opacity]);

  if (!mounted) return null;

  const label = locating ? 'Finding your location…' : 'Loading nearby spots…';

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { top: insets.top + topOffset, opacity }]}
    >
      <View style={[styles.pill, stampBorder]}>
        <BrandText weight="semibold" color={Brand.ink} style={styles.label}>
          {label}
        </BrandText>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.chunk, { transform: [{ translateX: slide }] }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 60,
    alignItems: 'center',
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.three,
    backgroundColor: Brand.bg,
    borderRadius: BrandRadius.pill,
    marginBottom: 5,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  track: {
    width: '100%',
    height: 3,
    overflow: 'hidden',
  },
  chunk: {
    width: CHUNK,
    height: 3,
    backgroundColor: Brand.teal,
    borderRadius: 2,
  },
});
