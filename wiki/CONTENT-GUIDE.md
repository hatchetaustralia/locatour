# Locatour Wiki — Content Guide

This wiki is **public**. It is the player-facing guide, brand home, and legal
home for Locatour. It is **not** the internal engineering spec — those live in
`/docs/locatour/` and stay private.

## The one rule: overview level only

Describe **what players can achieve and why**, never **how the engine computes
it**. The mechanics are the product's moat — protect them.

**Never publish:**

- Tier / level XP formulas or constants (the OSRS curve, the `÷4` multiplier).
- Point thresholds or the per-tier points table (100 → 22,000).
- Carrying-capacity / protection numbers.
- Geofence radii, accuracy thresholds, freshness windows, cooldown hours.
- Anti-cheat / scrape-detection thresholds or scoring.
- Check-in verification internals (the decision matrix, EXIF handling, etc.).

**Do publish:**

- What a feature lets a player do, and how it feels to play.
- Why a feature exists (the civic / conservation / memory-making intent).
- Honest, plain-language data and privacy practices.

**Phrasing pattern**

- ✅ "Higher tiers unlock the ability to reach more fragile, hidden places."
- ❌ "You reach tier 6 at 51 levels / N points."

**Nearby alerts — what's OK to publish.** Player-facing UX that the app already
surfaces is fine: the feature exists, it's opt-in/off-by-default, the **+20%
points bonus** (shown in-app), and the anti-spam behaviour (a small daily cap,
quiet overnight hours, no repeat pings for ~a month). Keep the **spot-detection
distances qualitative** ("a few hundred metres" / "as you get close"), not exact,
and never publish the region count, DB internals, or multiplier constants by
name.

## Tone

Warm, encouraging, plain-spoken. Think a friendly game wiki, not a legal
notice (except the legal pages, which are precise but still readable).

## Structure

- Content is Markdown in `src/content/docs/**`; the path is the URL.
- Sidebar order is set in `astro.config.mjs`.
- Every page has a `title` and `description` in frontmatter (the description
  feeds SEO/AEO meta — write it for a human searcher).

## Legal pages

`legal/privacy.md` and `legal/terms.md` are **review-ready drafts, not legal
advice.** Fill the placeholders before publishing:

- `[LEGAL_ENTITY_NAME]`
- `[SUPPORT_EMAIL]`
- `[GOVERNING_LAW_JURISDICTION]`
- `[EFFECTIVE_DATE]`
