/**
 * PassportStamp — the inked rubber-stamp overlay slapped on a successful
 * check-in. A slightly-tilted bordered badge with the STATUS as the big stamp
 * word, the location below it, and a short human date. The whole thing reads
 * like a real passport stamp: a double ring, a touch of rotation, and an inked
 * accent tint that shifts with the status (gold for a fresh Discovery, a
 * teal/purple wash for Explorer, plain ink for a routine Checked In).
 *
 * Self-contained: it sizes itself and applies its own tilt. The parent is
 * expected to position it (we never set position:absolute here).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandText } from '@/components/brand';
import { Brand, BrandFonts, BrandRadius } from '@/constants/theme';

type Status = 'Checked In' | 'Discovered' | 'Explorer';

const SIZE = 164;

// Each status gets its own inked colourway: the ring/text tint, a soft glow
// behind the badge, and (for the rainbow Discovery) gradient stops.
const STATUS_STYLE: Record<
  Status,
  { tint: string; glow: readonly [string, string, ...string[]] }
> = {
  Discovered: {
    tint: Brand.sticker.gold,
    glow: [Brand.sticker.pink, Brand.sticker.gold, Brand.sticker.green],
  },
  Explorer: {
    tint: Brand.purple,
    glow: [Brand.teal, Brand.purple],
  },
  'Checked In': {
    tint: Brand.ink,
    glow: [Brand.inkSubtle, Brand.ink],
  },
};

/** "2026-06-22" → "22 Jun 2026". Falls back to the raw string if unparseable. */
function formatStampDate(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function PassportStamp(props: {
  locationName: string;
  dateISO: string;
  status: Status;
}): React.JSX.Element {
  const { locationName, dateISO, status } = props;
  const { tint, glow } = STATUS_STYLE[status];

  return (
    <View style={styles.root}>
      {/* Soft inked halo so the stamp looks pressed onto the photo. */}
      <LinearGradient
        colors={glow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.glow}
      />

      <View style={[styles.outerRing, { borderColor: tint }]}>
        <View style={[styles.innerRing, { borderColor: tint }]}>
          <BrandText weight="bold" color={tint} style={styles.status} numberOfLines={1}>
            {status.toUpperCase()}
          </BrandText>

          <View style={[styles.rule, { backgroundColor: tint }]} />

          <BrandText
            weight="semibold"
            color={tint}
            style={styles.location}
            numberOfLines={2}
          >
            {locationName}
          </BrandText>

          <BrandText weight="medium" color={tint} style={styles.date} numberOfLines={1}>
            {formatStampDate(dateISO)}
          </BrandText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    // The signature tilt — a stamp is never perfectly straight.
    transform: [{ rotate: '-8deg' }],
  },
  // Blurred-ish glow behind the rings (a faint inked bleed into the page).
  glow: {
    position: 'absolute',
    width: SIZE - 16,
    height: SIZE - 16,
    borderRadius: BrandRadius.pill,
    opacity: 0.16,
  },
  outerRing: {
    width: SIZE - 8,
    height: SIZE - 8,
    borderRadius: BrandRadius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // A faint inked fill keeps the centre readable over a busy photo.
    backgroundColor: 'rgba(252,240,232,0.55)',
  },
  innerRing: {
    width: SIZE - 28,
    height: SIZE - 28,
    borderRadius: BrandRadius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  status: {
    fontFamily: BrandFonts.bold,
    fontSize: 22,
    letterSpacing: 1.5,
    textAlign: 'center',
    // A slightly faded ink so the big word reads as a pressed stamp, not flat type.
    opacity: 0.92,
  },
  rule: {
    width: 56,
    height: 2,
    borderRadius: 1,
    marginVertical: 6,
    opacity: 0.75,
  },
  location: {
    fontSize: 12,
    letterSpacing: 0.4,
    textAlign: 'center',
    opacity: 0.92,
  },
  date: {
    fontSize: 10,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.85,
  },
});
