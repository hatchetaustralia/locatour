/**
 * leveling.ts — the single source of truth for Locatour's RuneScape-inspired
 * progression system (see docs/locatour/06-rich-locations-and-leveling-spec.md).
 *
 * Everything that touches levels, XP, tiers or per-tier point defaults must come
 * through here so the curve stays faithful to the authentic Old School RuneScape
 * experience formula and is never "tuned" in two places.
 */

/** The authentic OSRS level cap. */
export const MAX_LEVEL = 99;

/** Number of location tiers (1..10). Tier 10 unlocks at level 91. */
export const MAX_TIER = 10;

/** A user cannot re-check the same location within this many hours. */
export const CHECKIN_COOLDOWN_H = 24;

/**
 * Tiers ABOVE your unlocked tier that count as "hidden" (spec 08): not shown on
 * the map, but discoverable by physically finding them. Anything beyond this is
 * "secret" — never surfaced, so the marquee spots aren't leaked.
 */
export const HIDDEN_TIER_RANGE = 3;

/** First-find XP multiplier when you DISCOVER a hidden (locked) location. */
export const DISCOVERY_MULTIPLIER = 3;

/** Proximity (metres) at which the camera goes "warm" near an undiscovered hidden spot. */
export const WARM_RADIUS_M = 500;

/**
 * Default XP reward per location tier, anchored to the OSRS XP "band" each tier
 * spans (the XP between the level it unlocks at and the next tier). This is an
 * explicit lookup — NOT a smooth formula — so it stays pinned to the bands in
 * the spec. Index by tier 1..10. Points roughly double per tier.
 */
const DEFAULT_POINTS_BY_TIER = [100, 200, 350, 700, 1300, 2300, 4200, 8000, 14000, 22000];

/**
 * Cumulative XP required to *reach* level L, using the authentic OSRS formula:
 *
 *   xpForLevel(L) = floor( (1/4) · Σ_{ℓ=1}^{L−1} floor( ℓ + 300 · 2^(ℓ/7) ) )
 *
 * Level 1 = 0 XP. The inner term is floored per ℓ, summed, then the ÷4 result
 * is floored. Verified milestones: L2=83, L10=1,154, L50=101,333, L99=13,034,431.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // Allow virtual levels above 99 for progress-bar math, but callers should not
  // surface levels past MAX_LEVEL to the user.
  let sum = 0;
  for (let l = 1; l <= level - 1; l++) {
    sum += Math.floor(l + 300 * Math.pow(2, l / 7));
  }
  return Math.floor(sum / 4);
}

// Precompute the cumulative thresholds 1..MAX_LEVEL once. Index i holds the XP
// needed to reach level i (index 0 unused). This keeps levelForXP a cheap lookup.
const XP_TABLE: number[] = (() => {
  const table: number[] = [0]; // index 0 unused
  for (let level = 1; level <= MAX_LEVEL; level++) {
    table[level] = xpForLevel(level);
  }
  return table;
})();

/**
 * The level (1..MAX_LEVEL) a user is at given their cumulative totalXP.
 * Negative / NaN XP is treated as 0 (level 1). Clamped at MAX_LEVEL.
 */
export function levelForXP(totalXP: number): number {
  const xp = Number.isFinite(totalXP) && totalXP > 0 ? totalXP : 0;
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (xp >= XP_TABLE[l]) {
      level = l;
    } else {
      break;
    }
  }
  return level;
}

/**
 * XP accumulated *within* the user's current level — i.e. progress past the
 * threshold for their current level. At MAX_LEVEL this is all XP banked beyond
 * the level-99 threshold (the bar reads full via xpForNextLevel below).
 */
export function xpIntoLevel(totalXP: number): number {
  const xp = Number.isFinite(totalXP) && totalXP > 0 ? totalXP : 0;
  const level = levelForXP(xp);
  return xp - XP_TABLE[level];
}

/**
 * XP span of the current level — the gap between this level's threshold and the
 * next level's. Pass the user's CURRENT level. At MAX_LEVEL there is no next
 * level, so we return the span of the final level (99 - 98) to keep progress
 * bars non-zero and well-defined; UI should treat L99 as "maxed".
 */
export function xpForNextLevel(level: number): number {
  const lvl = Math.max(1, Math.min(level, MAX_LEVEL));
  if (lvl >= MAX_LEVEL) {
    // No further level; report the last real span so denominators never hit 0.
    return XP_TABLE[MAX_LEVEL] - XP_TABLE[MAX_LEVEL - 1];
  }
  return XP_TABLE[lvl + 1] - XP_TABLE[lvl];
}

/**
 * The highest location tier a user of the given level can see.
 *   unlockedTier(level) = min(10, floor((level−1)/10) + 1)
 * L1..10 → 1, L11..20 → 2, … , L91..99 → 10.
 */
export function unlockedTier(level: number): number {
  const lvl = Math.max(1, Math.min(level, MAX_LEVEL));
  return Math.min(MAX_TIER, Math.floor((lvl - 1) / 10) + 1);
}

/**
 * The player level at which a given tier (1..MAX_TIER) unlocks — the inverse of
 * {@link unlockedTier}. Tier 1 → level 1, tier 2 → level 11, …, tier 10 → level 91.
 */
export function levelForTier(tier: number): number {
  const t = Math.max(1, Math.min(Math.floor(tier) || 1, MAX_TIER));
  return (t - 1) * 10 + 1;
}

/**
 * The highest tier a player can DISCOVER right now — their unlocked tier plus the
 * hidden range. Tiers above this are secret (never matched, never surfaced).
 */
export function maxDiscoverableTier(level: number): number {
  return Math.min(MAX_TIER, unlockedTier(level) + HIDDEN_TIER_RANGE);
}

/**
 * Default point reward for a location of the given tier (1..10). Out-of-range
 * tiers clamp into range; the admin may override per location.
 */
export function defaultPointsForTier(tier: number): number {
  const t = Math.max(1, Math.min(Math.floor(tier) || 1, MAX_TIER));
  return DEFAULT_POINTS_BY_TIER[t - 1];
}

/**
 * Derive the User.stats level fields from cumulative totalXP. Keeping this in
 * one place means storage/profile/check-in all agree on what a given totalXP
 * means. Returns the four computed fields the UI reads.
 */
export interface DerivedLevelStats {
  currentLevel: number;
  currentXPInLevel: number;
  xpNeededForNextLevel: number;
  currentXP: number;
}

export function deriveLevelStats(totalXP: number): DerivedLevelStats {
  const currentXP = Number.isFinite(totalXP) && totalXP > 0 ? totalXP : 0;
  const currentLevel = levelForXP(currentXP);
  return {
    currentLevel,
    currentXPInLevel: xpIntoLevel(currentXP),
    xpNeededForNextLevel: xpForNextLevel(currentLevel),
    currentXP,
  };
}

/**
 * A console-free self-check of the curve and gating constants. Returns the list
 * of failed assertions (empty array = everything correct). The app can call this
 * in dev (e.g. behind __DEV__) to fail loudly if the constants ever drift.
 */
export function checkLevelingInvariants(): string[] {
  const failures: string[] = [];
  const expect = (label: string, actual: number, expected: number) => {
    if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
  };

  // Authentic OSRS milestones (spec §1).
  expect('xpForLevel(1)', xpForLevel(1), 0);
  expect('xpForLevel(2)', xpForLevel(2), 83);
  expect('xpForLevel(10)', xpForLevel(10), 1154);
  expect('xpForLevel(20)', xpForLevel(20), 4470);
  expect('xpForLevel(30)', xpForLevel(30), 13363);
  expect('xpForLevel(40)', xpForLevel(40), 37224);
  expect('xpForLevel(50)', xpForLevel(50), 101333);
  expect('xpForLevel(70)', xpForLevel(70), 737627);
  expect('xpForLevel(92)', xpForLevel(92), 6517253);
  expect('xpForLevel(99)', xpForLevel(99), 13034431);

  // levelForXP round-trips at and just below thresholds.
  expect('levelForXP(0)', levelForXP(0), 1);
  expect('levelForXP(82)', levelForXP(82), 1);
  expect('levelForXP(83)', levelForXP(83), 2);
  expect('levelForXP(1154)', levelForXP(1154), 10);
  expect('levelForXP(13034431)', levelForXP(13034431), 99);
  expect('levelForXP(99e9)', levelForXP(99e9), 99); // clamps at cap

  // Tier gating (spec §1).
  expect('unlockedTier(1)', unlockedTier(1), 1);
  expect('unlockedTier(10)', unlockedTier(10), 1);
  expect('unlockedTier(11)', unlockedTier(11), 2);
  expect('unlockedTier(40)', unlockedTier(40), 4);
  expect('unlockedTier(91)', unlockedTier(91), 10);
  expect('unlockedTier(99)', unlockedTier(99), 10);

  // Tier point defaults.
  expect('defaultPointsForTier(1)', defaultPointsForTier(1), 100);
  expect('defaultPointsForTier(10)', defaultPointsForTier(10), 22000);

  return failures;
}
