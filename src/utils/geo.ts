import { Linking, Platform } from 'react-native';
import { VICINITY_RADIUS_M } from './leveling';

type LatLng = { latitude: number; longitude: number };

/**
 * Straight-line (Haversine) distance in metres between two coordinates. The
 * single source of truth for proximity math across the app.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000; // Earth radius in metres
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Local-first vicinity check: true if the user's location is unknown (no fix yet
 * — don't hide the world before GPS arrives) OR the target sits within radiusM of
 * the user. Major-destination handling is applied by the caller alongside this.
 */
export function isWithinVicinity(
  userCoords: LatLng | null | undefined,
  coords: LatLng,
  radiusM: number = VICINITY_RADIUS_M
): boolean {
  if (!userCoords) return true;
  return distanceMeters(userCoords, coords) <= radiusM;
}

/**
 * Human-friendly distance. Under 1 km shows whole metres ("840 m"); 1–10 km
 * shows one decimal ("4.2 km"); beyond that, whole km ("48 km"). Fixes the
 * "47944m away" eyesore.
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * Open turn-by-turn directions in the device's native maps app — Apple Maps on
 * iOS, the Google Maps / geo chooser on Android — falling back to Google Maps on
 * the web or if the native scheme can't be handled.
 */
export function openDirections(latitude: number, longitude: number, label?: string): void {
  const name = encodeURIComponent(label ?? 'Destination');
  const web = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  const url =
    Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}&q=${name}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${name})`,
      default: web,
    }) ?? web;

  Linking.openURL(url).catch(() => {
    Linking.openURL(web).catch(() => {});
  });
}
