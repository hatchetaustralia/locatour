/**
 * places.ts — thin client for the backend's Google Places suburb proxy.
 *
 * The Maps key lives on the server (see backend PlacesController), so the app
 * asks the API for suburb suggestions rather than calling Google directly.
 * Tries each candidate API base in turn (LAN IP / emulator alias) and fails
 * soft to an empty list so onboarding can fall back to free-typed text.
 */
import { API_URLS, API_TIMEOUT_MS } from '@/constants/config';

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
