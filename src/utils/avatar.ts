// Always resolve to a real, renderable avatar image.
// - Empty/missing → a deterministic dicebear "adventurer" avatar seeded by the
//   user's name (so the profile / tab never show a blank circle).
// - dicebear URLs are coerced to the PNG variant: React Native's <Image> cannot
//   render SVG, and older profiles were saved with the /svg endpoint (which comes
//   through blank).
export function avatarUri(avatarUrl?: string | null, seed?: string): string {
  const s = encodeURIComponent((seed || '').trim() || 'explorer');
  const fallback = `https://api.dicebear.com/7.x/adventurer/png?seed=${s}&backgroundColor=c0aede`;

  const url = (avatarUrl || '').trim();
  if (!url) return fallback;
  if (url.includes('api.dicebear.com')) {
    // Replace the format segment (e.g. /svg?) with /png?, keeping the query.
    return url.replace(/\/(svg|jpe?g|webp|json)(\?|$)/i, '/png$2');
  }
  return url;
}

// ---------------------------------------------------------------------------
// Avatar catalog — the level-gated grid shown in the AvatarPicker. Each preset
// is a dicebear "adventurer" illustration (PNG, so React Native's <Image> can
// render it) and carries a `minLevel`: a preset is selectable once the user's
// level reaches it. More exclusive characters sit behind higher levels, giving
// players something to unlock as they climb. The free chunk (minLevel 1) is the
// largest so a brand-new explorer already has plenty to choose from.
// ---------------------------------------------------------------------------
export type AvatarPreset = {
  /** Stable id (the dicebear seed) — also used as the React key. */
  id: string;
  /** Fully-resolved PNG avatar URL. */
  url: string;
  /** Level at which this preset unlocks (1 = available to everyone). */
  minLevel: number;
};

// Warm palette reused from the onboarding presets so the grid sits on-brand.
const AVATAR_BG = ['b6e3f4', 'ffdfbf', 'c0aede', 'd1f4c9', 'ffd5dc', 'ffeeb3', 'c8f7dc', 'e0d4fb'];

function dicebear(seed: string, bg: string): string {
  return `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
}

// [seed, minLevel] tiers — the first dozen are free, then exclusivity ramps with
// the level curve (3 / 5 / 10 / 15 / 20 / 25 / 30).
const AVATAR_SEEDS: [string, number][] = [
  // Level 1 — free starter set (12)
  ['Felix', 1], ['Aneka', 1], ['Jack', 1], ['Mia', 1],
  ['Leo', 1], ['Zoe', 1], ['Milo', 1], ['Ruby', 1],
  ['Oscar', 1], ['Ivy', 1], ['Finn', 1], ['Nina', 1],
  // Level 3
  ['Hugo', 3], ['Cleo', 3], ['Theo', 3], ['Luna', 3],
  // Level 5
  ['Atlas', 5], ['Wren', 5], ['Jasper', 5], ['Sage', 5],
  // Level 10
  ['Phoenix', 10], ['Indigo', 10], ['Onyx', 10], ['Aurora', 10],
  // Level 15
  ['Maverick', 15], ['Juniper', 15], ['Orion', 15], ['Willow', 15],
  // Level 20
  ['Everest', 20], ['Marlowe', 20], ['Caspian', 20], ['Lyra', 20],
  // Level 25
  ['Zephyr', 25], ['Seraphina', 25],
  // Level 30 — the most exclusive
  ['Odyssey', 30], ['Nyx', 30],
];

export const AVATAR_CATALOG: AvatarPreset[] = AVATAR_SEEDS.map(([seed, minLevel], i) => ({
  id: seed,
  url: dicebear(seed, AVATAR_BG[i % AVATAR_BG.length]),
  minLevel,
}));

/** Whether a preset is unlocked for a given level. */
export function isAvatarUnlocked(preset: AvatarPreset, level: number): boolean {
  return level >= preset.minLevel;
}
