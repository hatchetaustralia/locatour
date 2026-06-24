/**
 * HiddenNearbyBar — the shared "👀 Something's hidden nearby" status bar.
 *
 * Shows the centred label with the live distance pinned to the right in a cream
 * badge. The eyes emoji gently pulses + wiggles to draw the eye. Used on BOTH the
 * camera viewfinder and the map (so explorers can hunt a hidden spot from the
 * lower-battery map view, not just the camera). Pink so it stands out as a
 * special "secret nearby" state, distinct from the gold announcement.
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Animated, Easing } from 'react-native';

import { BrandText } from '@/components/brand';
import { Brand, BrandRadius, Spacing, stampBorder } from '@/constants/theme';
import { formatDistance } from '@/utils/geo';

export function HiddenNearbyBar({
  distance,
  style,
}: {
  /** Metres to the nearest undiscovered hidden spot (null hides the readout). */
  distance: number | null;
  style?: StyleProp<ViewStyle>;
}) {
  // Gentle looping pulse + wiggle on the eyes so the bar feels alive / urgent.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const rotate = pulse.interpolate({ inputRange: [0, 1], outputRange: ['-9deg', '9deg'] });

  return (
    <View style={[styles.bar, stampBorder, style]}>
      {/* Emoji pinned left; the label stays centred in the full bar width. */}
      <Animated.View
        style={[styles.emojiWrap, { transform: [{ scale }, { rotate }] }]}
        pointerEvents="none"
      >
        <BrandText style={styles.emoji}>👀</BrandText>
      </Animated.View>
      <BrandText weight="bold" color={Brand.ink} style={styles.label} numberOfLines={1}>
        Something&apos;s hidden nearby
      </BrandText>
      {distance != null && (
        <View style={styles.distanceWrap} pointerEvents="none">
          <View style={styles.distanceBadge}>
            <BrandText weight="bold" color={Brand.ink} style={styles.distance}>
              {formatDistance(distance)}
            </BrandText>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // centre the label
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.sticker.pink,
  },
  label: {
    fontSize: 14,
    textAlign: 'center',
  },
  emojiWrap: {
    position: 'absolute',
    left: Spacing.three,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 16,
  },
  // Distance is absolutely positioned so it never pushes the label off-centre.
  distanceWrap: {
    position: 'absolute',
    right: Spacing.two,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  // Cream badge with the black stamp outline (matches the home hero badge) so the
  // live distance stands out against the pink bar.
  distanceBadge: {
    ...stampBorder,
    backgroundColor: Brand.surface,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: BrandRadius.pill,
  },
  distance: {
    fontSize: 12,
  },
});
