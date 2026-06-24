/**
 * runtime-config.ts — server-controlled gameplay settings with safe fallbacks.
 *
 * The radii, multipliers and cooldowns that tune gameplay live as hard-coded
 * DEFAULTS in leveling.ts (the single source of truth for the curve). This module
 * layers a SERVER OVERRIDE on top: on launch the app fetches GET {API}/config and
 * shallow-merges any valid numeric fields it returns. Behaviour is byte-for-byte
 * identical until an admin changes a value, because:
 *   - `current` is SEEDED from the leveling.ts constants, so getConfig() is correct
 *     synchronously from the very first call (even before any fetch resolves), and
 *   - applyServerConfig only accepts FINITE numbers, so a partial / malformed /
 *     offline response can never corrupt a value or break the app.
 *
 * Consumers must read getConfig().<field> AT THE POINT OF USE (not captured at
 * module load) so a later server update is picked up live. Mirrors account.ts:
 * multi-base URL fallback, per-attempt timeout, fully fail-soft (never throws).
 */
import { API_URLS, API_TIMEOUT_MS } from '../constants/config';
import { storage } from './storage';
import {
  HIDDEN_RADIUS_M,
  WARM_RADIUS_M,
  CHECK_IN_RADIUS_M,
  VICINITY_RADIUS_M,
  REACH_RADIUS_M,
  CHECKIN_COOLDOWN_H,
  HIDDEN_TIER_RANGE,
  LOCK_TEASER_RANGE,
  DISCOVERY_MULTIPLIER,
  NEARBY_ALERTS_POINT_MULTIPLIER,
  RADIUS_TIER_BOOST_PCT,
  unlockedTier,
} from './leveling';

/**
 * The server-controlled gameplay settings. `revealRadiusM` and
 * `defaultSearchRadiusM` are backend-only (no app consumer) but are modelled here
 * for completeness so the type matches the /api/config payload exactly.
 */
export interface RuntimeConfig {
  hiddenRadiusM: number;
  warmRadiusM: number;
  checkInRadiusM: number;
  revealRadiusM: number;
  vicinityRadiusM: number;
  reachRadiusM: number;
  defaultSearchRadiusM: number;
  discoveryMultiplier: number;
  nearbyAlertsMultiplier: number;
  checkinCooldownH: number;
  hiddenTierRange: number;
  lockTeaserRange: number;
  radiusTierBoostPct: number;
}

// AsyncStorage isn't part of this app — persistence goes through the SAME kv store
// (localStorage on web / the SQLite `kv` table on native) the rest of the app uses.
const CACHE_KEY = 'locatour.runtimeConfig';

/**
 * Per-field sanity floor. A server returning 0 / negative for a radius or
 * multiplier would brick gameplay (radius 0 → can never check in; reach 0 →
 * locations never load), so those must be > 0. Cooldown and the tier-range fields
 * may legitimately be 0 (no cooldown / no extra band), so they floor at 0.
 * Anything below its floor is rejected and the seeded default is kept.
 */
const MINIMUMS: Record<keyof RuntimeConfig, number> = {
  hiddenRadiusM: 1,
  warmRadiusM: 1,
  checkInRadiusM: 1,
  revealRadiusM: 1,
  vicinityRadiusM: 1,
  reachRadiusM: 1,
  defaultSearchRadiusM: 1,
  discoveryMultiplier: 1,
  nearbyAlertsMultiplier: 1,
  checkinCooldownH: 0,
  hiddenTierRange: 0,
  lockTeaserRange: 0,
  radiusTierBoostPct: 0,
};

/**
 * Live config. SEEDED from the leveling.ts DEFAULTS so it is correct before any
 * fetch — these two backend-only fields have no app constant, so they take the
 * documented server defaults as their seed.
 */
const current: RuntimeConfig = {
  hiddenRadiusM: HIDDEN_RADIUS_M,
  warmRadiusM: WARM_RADIUS_M,
  checkInRadiusM: CHECK_IN_RADIUS_M,
  revealRadiusM: 2000, // backend-only default (no app constant)
  vicinityRadiusM: VICINITY_RADIUS_M,
  reachRadiusM: REACH_RADIUS_M,
  defaultSearchRadiusM: 200000, // backend-only default (no app constant)
  discoveryMultiplier: DISCOVERY_MULTIPLIER,
  nearbyAlertsMultiplier: NEARBY_ALERTS_POINT_MULTIPLIER,
  checkinCooldownH: CHECKIN_COOLDOWN_H,
  hiddenTierRange: HIDDEN_TIER_RANGE,
  lockTeaserRange: LOCK_TEASER_RANGE,
  radiusTierBoostPct: RADIUS_TIER_BOOST_PCT,
};

/** The current runtime config. Read at point-of-use so live updates apply. */
export function getConfig(): RuntimeConfig {
  return current;
}

/**
 * Flat (non-compounding) radius multiplier for a player's level, applied to the
 * discovery (warm) and localised-locations (vicinity) radii: tier 1 → 1.0,
 * tier 2 → 1.1, … tier 10 → 1.9 (at the default 10%). Driven by unlockedTier so
 * it steps once per tier (every 10 levels). Read at point-of-use.
 */
export function tierRadiusBoost(level: number): number {
  return 1 + Math.max(0, unlockedTier(level) - 1) * (current.radiusTierBoostPct / 100);
}

/**
 * Shallow-merge a (possibly partial / untrusted) payload into `current`, taking
 * ONLY finite numeric fields for keys we know. Anything missing, NaN, non-numeric
 * or unknown is ignored, so a bad/partial response can never break the app. The
 * merged config is then cached (best-effort) for the next launch.
 */
export function applyServerConfig(partial: Partial<Record<keyof RuntimeConfig, unknown>> | null | undefined): void {
  if (!partial || typeof partial !== 'object') return;
  let changed = false;
  for (const key of Object.keys(current) as (keyof RuntimeConfig)[]) {
    const raw = (partial as Record<string, unknown>)[key];
    // Strictly require a real finite number ≥ its floor. Rejecting the Number()
    // coercion path keeps booleans / "" / [] (which would coerce to 0/1) from
    // silently overwriting a default — the server only ever emits numbers|null.
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= MINIMUMS[key]) {
      current[key] = raw;
      changed = true;
    }
  }
  if (changed) {
    try {
      storage.setItem(CACHE_KEY, JSON.stringify(current));
    } catch {
      // best-effort cache — never throws
    }
  }
}

/**
 * Hydrate the live config from the last cached server response (best-effort).
 * Lets an offline launch keep the most recent admin values until the next fetch.
 * Swallows every error.
 */
export async function hydrateFromCache(): Promise<void> {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    applyServerConfig(parsed);
  } catch {
    // ignore — fall back to the seeded defaults
  }
}

/**
 * Fetch GET {API}/config and apply it. Mirrors account.ts base-URL resolution +
 * per-attempt timeout. Tries each candidate base until one answers; applies the
 * first OK JSON body. Never throws.
 */
export async function fetchAndApplyConfig(): Promise<void> {
  for (const base of API_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/api/config`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json) applyServerConfig(json);
        return;
      }
    } catch {
      // timeout / offline / refused — try the next candidate base
    } finally {
      clearTimeout(timer);
    }
  }
}
