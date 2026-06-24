/**
 * BlurredText — a genuinely blurred, unreadable stand-in for a string.
 *
 * Used to keep LOCKED / hidden spot names + addresses a mystery worth chasing.
 *
 * Why not a text-shadow "blur"? A CSS-style `textShadowRadius` only draws a
 * soft-edged COPY of the exact same letterforms — the glyph silhouettes survive,
 * so the text stays perfectly legible (you just read the fuzzy shadow). And the
 * real string is still sitting in the view tree, recoverable. This component
 * instead draws a SCRAMBLED placeholder through a real Skia Gaussian blur, so:
 *   1. the blur is a true blur (illegible smear, not soft letters), and
 *   2. the real text is NEVER rendered — nothing to read, nothing to recover.
 *
 * Skia (@shopify/react-native-skia) is already a native dependency in the app
 * (shutter button, hidden-hero glow, map glow), so this needs no extra install
 * and no dev-client APK rebuild.
 */
import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import {
  Canvas,
  Text as SkiaText,
  Group,
  Paint,
  Blur,
  matchFont,
} from '@shopify/react-native-skia';

// Deterministic, position-seeded scramble. Keeps whitespace (so word count and
// rough length read as a plausible name under the blur) but exposes none of the
// real characters. Same input → same output, so it doesn't shimmer on re-render.
const POOL = 'aeocnirtslmudpgh';
function scramble(input: string): string {
  let i = 0;
  return input.replace(/\S/g, () => {
    const ch = POOL[(i * 7 + 3) % POOL.length];
    i += 1;
    return ch;
  });
}

export function BlurredText({
  children,
  fontSize = 14,
  weight = '600',
  color = '#2A2421',
  blur = 4,
  maxWidth = 200,
}: {
  /** The real string to hide — used only to size/shape the blurred placeholder. */
  children: string;
  fontSize?: number;
  /** A Skia/RN font weight string, e.g. '500' | '600' | '700'. */
  weight?: string;
  color?: string;
  /** Gaussian blur sigma. ~4 fully smears 12–15px text into an unreadable bar. */
  blur?: number;
  /** Cap the single-line width; the placeholder is truncated to fit. */
  maxWidth?: number;
}): React.JSX.Element {
  const font = useMemo(
    () =>
      matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
        fontSize,
        fontWeight: weight as '500' | '600' | '700',
      }),
    [fontSize, weight],
  );

  const { text, width, height, baseline, padX } = useMemo(() => {
    // Pad so the blur fades out INSIDE the canvas instead of clipping to a hard
    // edge. Horizontal needs the full smear (first/last glyph); vertical is kept
    // tight so a locked card's row height barely differs from an unlocked one.
    const padXpx = Math.ceil(blur * 2);
    const padYpx = Math.ceil(blur);
    let t = scramble(children);
    let w = font.measureText(t).width;
    // Single line: trim the placeholder until it fits the width cap.
    while (w > maxWidth && t.length > 1) {
      t = t.slice(0, -1);
      w = font.measureText(t).width;
    }
    const m = font.getMetrics();
    const ascent = m ? Math.abs(m.ascent) : fontSize * 0.9;
    const descent = m ? Math.abs(m.descent) : fontSize * 0.25;
    return {
      text: t,
      width: Math.ceil(w) + padXpx * 2,
      height: Math.ceil(ascent + descent) + padYpx * 2,
      baseline: ascent + padYpx,
      padX: padXpx,
    };
  }, [children, font, blur, maxWidth, fontSize]);

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Group
        layer={
          <Paint>
            <Blur blur={blur} />
          </Paint>
        }
      >
        <SkiaText x={padX} y={baseline} text={text} font={font} color={color} />
      </Group>
    </Canvas>
  );
}
