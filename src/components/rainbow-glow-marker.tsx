/**
 * RainbowGlowMarker — a STATIC rainbow halo for the map "you are here" avatar,
 * matching the camera shutter button's rainbow glow.
 *
 * Why it's done this way (three Android constraints, all verified):
 *  1. A LIVE Skia <Canvas> renders BLANK inside a react-native-maps Marker child
 *     that's rasterized via tracksViewChanges (react-native-maps#4902). So we
 *     can't draw the glow live in the marker — we must pre-bake it to an image.
 *  2. Skia's drawAsImage()/Surface.MakeOffscreen() use a GPU surface that can
 *     return null on Android when called off the UI thread (skia#2253/#2281). So
 *     we rasterize on a CPU surface only: drawAsPicture() (CPU PictureRecorder)
 *     + Skia.Surface.Make() (CPU raster). No GPU/EGL context required.
 *  3. A data: URI <Image> is decoded asynchronously by Fresco and is often missed
 *     by the synchronous marker-bitmap snapshot (react-native-maps#5826/#5707).
 *     So we write a real PNG to the cache dir and use a file:// URI, which Fresco
 *     decodes synchronously.
 *
 * Result: a plain RN <Image> of a pre-baked file:// PNG — the one thing the marker
 * snapshots reliably. The glow is static (no spin/pulse), inherent to a frozen
 * marker bitmap and acceptable. Palette / blur / radii mirror shutter-button.tsx.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  drawAsPicture,
  Skia,
  Group,
  Circle,
  SweepGradient,
  Paint,
  Blur,
  vec,
  ImageFormat,
} from '@shopify/react-native-skia';

// Exact palette from the shutter button — a full-spectrum sweep that wraps
// (#ff3b30 repeated at both ends so the conic gradient loops seamlessly).
const RAINBOW = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff3b30'];

// Shutter sizing. GLOW_R is kept small so the blur fully fades INSIDE the canvas
// (otherwise the blur clips to a hard square edge).
const SIZE = 120; // logical canvas (== shutter)
const C = SIZE / 2; // 60 — centre
const GLOW_R = 36; // halo radius (matches shutter GLOW_R)
const BLUR = 6; // matches shutter blur
const SCALE = 2; // rasterise at 2x for crispness, display down at DISPLAY

// On-screen footprint. ~90 puts the halo's bright band a touch outside the 40px
// avatar ring (so it reads as a glow), with blur headroom inside the bitmap.
const DISPLAY = 90;

// Module-level cache so the PNG is baked + written only once per app session.
let cachedUri: string | null = null;

async function buildGlowUri(): Promise<string | null> {
  if (cachedUri) return cachedUri;
  try {
    // CPU-only pipeline (see header note 2): record to a Picture, replay onto a
    // CPU raster surface — never a GPU offscreen surface.
    const picture = await drawAsPicture(
      <Group
        layer={
          <Paint>
            <Blur blur={BLUR * SCALE} />
          </Paint>
        }
      >
        <Circle c={vec(C * SCALE, C * SCALE)} r={GLOW_R * SCALE}>
          <SweepGradient c={vec(C * SCALE, C * SCALE)} colors={RAINBOW} />
        </Circle>
      </Group>,
    );
    const surface = Skia.Surface.Make(SIZE * SCALE, SIZE * SCALE);
    if (!surface) return null;
    surface.getCanvas().drawPicture(picture);
    surface.flush();
    const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG);

    // Write a real PNG and hand back a file:// URI (see header note 3).
    const file = new File(Paths.cache, 'locatour-rainbow-glow.png');
    file.create({ overwrite: true });
    file.write(bytes);
    cachedUri = file.uri;
    return cachedUri;
  } catch (e) {
    // If anything fails, render nothing — the avatar ring still shows, never a
    // broken marker.
    console.warn('RainbowGlowMarker: failed to build glow PNG', e);
    return null;
  }
}

export function RainbowGlowMarker() {
  const [uri, setUri] = useState<string | null>(cachedUri);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!uri) {
      buildGlowUri().then((u) => {
        if (mounted.current && u) setUri(u);
      });
    }
    return () => {
      mounted.current = false;
    };
  }, [uri]);

  if (!uri) return null;
  return <Image source={{ uri }} style={styles.glow} fadeDuration={0} />;
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    width: DISPLAY,
    height: DISPLAY,
  },
});
