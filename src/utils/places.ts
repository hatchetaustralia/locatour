/**
 * places.ts — thin client for the backend's Google Places suburb proxy.
 *
 * The Maps key lives on the server (see backend PlacesController), so the app
 * asks the API for suburb suggestions rather than calling Google directly.
 * Tries each candidate API base in turn (LAN IP / emulator alias) and fails
 * soft to an empty list so onboarding can fall back to free-typed text.
 */
import { API_URLS, API_TIMEOUT_MS } from '@/constants/config';
import { Coordinates } from '@/types';

export interface SuburbSuggestion {
  description: string;
  placeId?: string;
}

export async function fetchSuburbs(query: string): Promise<SuburbSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  for (const base of API_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      const res = await fetch(`${base}/api/places/suburbs?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as { suggestions?: SuburbSuggestion[] };
      return Array.isArray(json.suggestions) ? json.suggestions : [];
    } catch {
      // Try the next base URL; if all fail the caller uses free text.
      continue;
    }
  }
  return [];
}

/**
 * Resolve a suburb to coordinates via the backend Places proxy (keeps the Maps
 * key server-side). Prefer the placeId from a picked suggestion (precise); pass
 * the description as a fallback for free-typed entries. Returns null on any
 * failure so callers degrade gracefully (the base coords are a nice-to-have).
 */
export async function fetchPlaceCoordinates(opts: {
  placeId?: string;
  suburb?: string;
}): Promise<Coordinates | null> {
  const params = new URLSearchParams();
  if (opts.placeId) params.set('placeId', opts.placeId);
  if (opts.suburb) params.set('suburb', opts.suburb);
  if (![...params].length) return null;

  for (const base of API_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      const res = await fetch(`${base}/api/places/coordinates?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as { lat?: number; lng?: number };
      if (typeof json.lat === 'number' && typeof json.lng === 'number') {
        return { latitude: json.lat, longitude: json.lng };
      }
      // Reached the server but it had no coords — don't retry other bases.
      return null;
    } catch {
      continue;
    }
  }
  return null;
}
