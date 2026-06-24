/**
 * PassportStamp — the inked rubber-stamp keepsake slapped on a successful
 * check-in. A slightly-tilted double-ring badge with a CUSTOM line-illustration
 * postmark emblem at its heart (drawn with Skia — concentric ring + radial ticks
 * + a status motif), the location below it, and a short human date. Reads like a
 * real passport / postal cancellation stamp, not a flat icon.
 *
 * Self-contained: it sizes itself and applies its own tilt. The parent positions
 * it (we never set position:absolute here).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, Circle, Path, Group, vec } from '@shopify/react-native-skia';

import { BrandText } from '@/components/brand';
import { Brand, BrandRadius } from '@/constants/theme';

type Status = 'Checked In' | 'Discovered' | 'Explorer';

const SIZE = 164;

// Each status gets its own inked colourway: the ring/emblem tint + a soft glow.
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

// ---------------------------------------------------------------------------
// Custom stamp emblem — a hand-drawn-feeling postmark line illustration (Skia).
// ---------------------------------------------------------------------------
const E = 72; // emblem canvas
const EC = E / 2; // centre

/** Radial tick marks between two radii (the postal-cancellation look). */
function radialTicks(r1: number, r2: number, n: number): string {
  let p = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x1 = (EC + r1 * Math.cos(a)).toFixed(2);
    const y1 = (EC + r1 * Math.sin(a)).toFixed(2);
    const x2 = (EC + r2 * Math.cos(a)).toFixed(2);
    const y2 = (EC + r2 * Math.sin(a)).toFixed(2);
    p += `M ${x1} ${y1} L ${x2} ${y2} `;
  }
  return p;
}

/** A pointed star motif (n points), centred — used for Discovered/Explorer. */
function starMotif(points: number, outer: number, inner: number): string {
  let p = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = (EC + r * Math.cos(a)).toFixed(2);
    const y = (EC + r * Math.sin(a)).toFixed(2);
    p += (i === 0 ? 'M ' : 'L ') + x + ' ' + y + ' ';
  }
  return p + 'Z';
}

const TICKS = radialTicks(22, 28, 28);
const MOTIF: Record<Status, string> = {
  Discovered: starMotif(5, 13, 5), // a 5-point discovery star
  Explorer: starMotif(4, 14, 4), // a 4-point compass star
  'Checked In': `M ${EC - 9} ${EC + 1} L ${EC - 2} ${EC + 8} L ${EC + 10} ${EC - 8}`, // a tick
};

function StampEmblem({ tint, status }: { tint: string; status: Status }): React.JSX.Element {
  return (
    <Canvas style={styles.emblemCanvas} pointerEvents="none">
      <Group opacity={0.92}>
        <Circle c={vec(EC, EC)} r={30} style="stroke" strokeWidth={1.5} color={tint} />
        <Path path={TICKS} style="stroke" strokeWidth={1.5} strokeCap="round" color={tint} />
        <Path
          path={MOTIF[status]}
          style="stroke"
          strokeWidth={2}
          strokeJoin="round"
          strokeCap="round"
          color={tint}
        />
      </Group>
    </Canvas>
  );
}

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
          <StampEmblem tint={tint} status={status} />

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
  emblemCanvas: {
    width: E,
    height: E,
    marginBottom: 2,
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
