/**
 * useUserAvatarMarker — bakes the "you are here" avatar into a STATIC local PNG so
 * it can be handed to a native react-native-maps <Marker image={...} /> instead of
 * a <Marker> with View children.
 *
 * Why a baked image (the whole point of this module):
 *  - A <Marker> with VIEW CHILDREN is rasterised via tracksViewChanges, and that
 *    path is unreliable on Android: it renders WHITE before the remote avatar
 *    paints and the snapshot is dropped on a tab-focus change, so the avatar
 *    vanishes (rn-maps #4902 / #5826 / #5707 — see rainbow-glow-marker.tsx).
 *  - A plain RN overlay positioned via mapRef.pointForCoordinate() is reliable but
 *    LAGS the map during a pan (async bridge call + JS-thread region callbacks).
 *  - A <Marker image={fileUri} /> takes neither path: react-native-maps hands a
 *    single bitmap straight to the native Google Maps marker, which is anchored to
 *    a LatLng and composited on the native GL surface — so it tracks pan/zoom in
 *    PERFECT lock-step (like the Uber puck) AND can't go white or be dropped.
 *
 * The bake reuses the proven CPU-only Skia pipeline from rainbow-glow-marker.tsx
 * (drawAsPicture → Skia.Surface.Make raster → encode PNG → write a real file:// the
 * native marker decodes synchronously). Two variants are baked: "cold" (avatar in a
 * teal ring) and "hot" (same, wrapped in the rainbow halo) so the nearby-glow state
 * is a single atomic image that moves locked to the avatar — no separate, lagging
 * glow overlay that would visibly drift away from the puck during a pan.
 *
 * The glow is static (no spin/pulse) — inherent to a frozen marker bitmap, and the
 * same trade-off rainbow-glow-marker.tsx already accepts.
 */
import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  drawAsPicture,
  Skia,
  Group,
  Circle,
  SweepGradient,
  Paint,
  Blur,
  Image as SkiaImage,
  rrect,
  rect,
  vec,
  ImageFormat,
} from '@shopify/react-native-skia';

// Logical layout (dp). Mirrors the old overlay: a 104dp footprint (room for the
// halo) with a 40dp ring centred in it; the avatar sits 17dp-radius inside.
const SIZE = 104; // footprint (== userMarkerWrap)
const C = SIZE / 2; // 52 — centre
const RING_R = 20; // 40dp ring (== userMarkerRing)
const AVATAR_R = 17; // 34dp avatar (== userMarkerAvatar)
const STROKE = 2; // ring border width

// Rainbow halo (hot variant) — palette + sizing copied from rainbow-glow-marker.
const RAINBOW = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff3b30'];
const GLOW_R = 36;
const BLUR = 6;

const RING_TEAL = '#7DE3E7'; // Brand.teal
const SURFACE = '#FFFFFF'; // Brand.surface (ring fill behind a transparent avatar)

// Bake at device-pixel density so the native marker (Android renders the bitmap
// 1:1 in device pixels) shows the ring at exactly 40dp on every screen.
const DENSITY = PixelRatio.get();
const PIX = Math.round(SIZE * DENSITY);

// Avatar loading robustness tunables.
const FETCH_TIMEOUT_MS = 7000; // max ms to wait for Skia.Data.fromURI before giving up
const MAX_RETRIES = 2; // in-session retry cap so a permanently-broken URL doesn't loop
const RETRY_DELAYS = [2000, 5000]; // ms before each successive retry attempt
// Dicebear fallback — matches avatar.ts pattern exactly (adventurer/png, explorer seed, same bg).
const DICEBEAR_FALLBACK = 'https://api.dicebear.com/7.x/adventurer/png?seed=explorer&backgroundColor=c0aede';

export type AvatarMarkerImages = { cold: string; hot: string };

// One bake per avatar URL per app session (keyed so a profile avatar change
// re-bakes). Promise-cached so concurrent callers share the in-flight bake.
const cache = new Map<string, Promise<AvatarMarkerImages | null>>();

async function bakeVariant(img: ReturnType<typeof Skia.Image.MakeImageFromEncoded>, hot: boolean): Promise<string | null> {
  const s = DENSITY; // scale dp → device px
  const picture = await drawAsPicture(
    <Group transform={[{ scale: s }]}>
      {/* Rainbow halo (hot only) — blurred sweep gradient behind the ring. */}
      {hot && (
        <Group layer={<Paint><Blur blur={BLUR} /></Paint>}>
          <Circle c={vec(C, C)} r={GLOW_R}>
            <SweepGradient c={vec(C, C)} colors={RAINBOW} />
          </Circle>
        </Group>
      )}
      {/* Ring fill (shows behind any transparency in the avatar). */}
      <Circle c={vec(C, C)} r={RING_R} color={SURFACE} />
      {/* Avatar, clipped to a circle inside the ring. */}
      <Group clip={rrect(rect(C - AVATAR_R, C - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2), AVATAR_R, AVATAR_R)}>
        <SkiaImage
          image={img}
          x={C - AVATAR_R}
          y={C - AVATAR_R}
          width={AVATAR_R * 2}
          height={AVATAR_R * 2}
          fit="cover"
        />
      </Group>
      {/* Ring stroke on top — white when hot (echoes the shutter button), else teal. */}
      <Circle
        c={vec(C, C)}
        r={RING_R - STROKE / 2}
        color={hot ? '#ffffff' : RING_TEAL}
        style="stroke"
        strokeWidth={STROKE}
      />
    </Group>,
  );

  const surface = Skia.Surface.Make(PIX, PIX);
  if (!surface) return null;
  surface.getCanvas().drawPicture(picture);
  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG);

  const file = new File(Paths.cache, `locatour-avatar-${hot ? 'hot' : 'cold'}.png`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

/** Race a promise against a ms-capped timeout; rejects with a timeout error if exceeded. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`useUserAvatarMarker: fetch timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/** Fetch + Skia-decode one URI, returning null on any failure (timeout, 404, corrupt bytes). */
async function fetchSkiaImage(uri: string): Promise<ReturnType<typeof Skia.Image.MakeImageFromEncoded>> {
  const data = await withTimeout(Skia.Data.fromURI(uri), FETCH_TIMEOUT_MS);
  return Skia.Image.MakeImageFromEncoded(data);
}

async function bake(avatarUri: string): Promise<AvatarMarkerImages | null> {
  try {
    // 1. Download + decode the remote avatar into a Skia image (CPU; no GPU context).
    //    Raced against FETCH_TIMEOUT_MS so a slow/expired/404 Google photo URL can't hang forever.
    let img = await fetchSkiaImage(avatarUri).catch(() => null);

    // 2. If primary fetch failed AND it wasn't already a dicebear URL, fall back to a generic
    //    dicebear avatar so the user still gets a visible puck instead of a blank marker.
    if (!img && !avatarUri.includes('dicebear.com')) {
      console.warn('useUserAvatarMarker: primary avatar failed, trying dicebear fallback');
      img = await fetchSkiaImage(DICEBEAR_FALLBACK).catch(() => null);
    }

    if (!img) return null;
    const [cold, hot] = await Promise.all([bakeVariant(img, false), bakeVariant(img, true)]);
    if (!cold || !hot) return null;
    return { cold, hot };
  } catch (e) {
    // Any remaining failure → null; the caller falls back to the RN overlay (never an empty ring).
    console.warn('useUserAvatarMarker: failed to bake avatar PNG', e);
    return null;
  }
}

/**
 * Bakes the cold + hot avatar marker PNGs for `avatarUri`. Returns the file:// URIs
 * once ready, or null while baking / on failure (caller should fall back to the RN
 * overlay so the avatar is never missing).
 *
 * Robustness additions vs the original:
 *  - bake() now times out the remote fetch (FETCH_TIMEOUT_MS) instead of hanging forever.
 *  - bake() falls back to a generic dicebear PNG if the primary URL fails.
 *  - On failure the hook retries up to MAX_RETRIES times (with RETRY_DELAYS backoff)
 *    within the same session so a transient network blip heals without a remount.
 *    All retries are cancelled on unmount to prevent setState-after-unmount.
 */
export function useUserAvatarMarker(avatarUri: string | null): AvatarMarkerImages | null {
  const [images, setImages] = useState<AvatarMarkerImages | null>(null);

  useEffect(() => {
    if (!avatarUri) {
      setImages(null);
      return;
    }
    let cancelled = false;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attemptBake = () => {
      let promise = cache.get(avatarUri);
      if (!promise) {
        promise = bake(avatarUri);
        cache.set(avatarUri, promise);
      }
      promise.then((res) => {
        if (cancelled) return;
        if (!res) {
          // Drop failed bake from cache so the next attempt starts fresh.
          cache.delete(avatarUri);
          if (retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAYS[retryCount] ?? 5000;
            retryCount++;
            retryTimer = setTimeout(() => {
              if (!cancelled) attemptBake();
            }, delay);
          } else {
            // Exhausted retries — surface null so the caller shows its fallback.
            setImages(null);
          }
        } else {
          setImages(res);
        }
      });
    };

    attemptBake();
    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [avatarUri]);

  return images;
}
