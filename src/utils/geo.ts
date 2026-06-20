import { Linking, Platform } from 'react-native';

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
