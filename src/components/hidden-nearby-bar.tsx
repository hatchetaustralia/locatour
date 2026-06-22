/**
 * HiddenNearbyBar — the shared "👀 Something's hidden nearby" status bar.
 *
 * Shows the centred label with the live distance pinned to the right. Used on
 * BOTH the camera viewfinder and the map (so explorers can hunt a hidden spot
 * from the lower-battery map view, not just the camera). Pink so it stands out
 * as a special "secret nearby" state, distinct from the gold announcement.
 */
import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

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
  return (
    <View style={[styles.bar, stampBorder, style]}>
      {/* Emoji pinned left; the label stays centred in the full bar width. */}
      <View style={styles.emojiWrap} pointerEvents="none">
        <BrandText style={styles.emoji}>👀</BrandText>
      </View>
      <BrandText weight="bold" color={Brand.ink} style={styles.label} numberOfLines={1}>
        Something&apos;s hidden nearby
      </BrandText>
      {distance != null && (
        <View style={styles.distanceWrap} pointerEvents="none">
          <BrandText weight="bold" color={Brand.ink} style={styles.distance}>
            {formatDistance(distance)}
          </BrandText>
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
    fontSize: 15,
  },
  // Distance is absolutely positioned so it never pushes the label off-centre.
  distanceWrap: {
    position: 'absolute',
    right: Spacing.three,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  distance: {
    fontSize: 13,
  },
});
