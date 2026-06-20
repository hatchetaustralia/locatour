# Rich Locations + Leveling/Tiers/Tags — Design Spec

**Status:** Design / approved decisions, pending spec sign-off.
**Date:** 2026-06-19.
**Scope:** (1) Rich location authoring in the Filament admin (map+geofence picker, image upload, points/tier sliders, tags); (2) a RuneScape-inspired leveling + location-tier gating system; (3) a category→tag taxonomy; (4) wiring the Expo app to consume all of it from the API. Spans `backend/` (Laravel/Filament) **and** the Expo app.

---

## 1. Leveling, tiers & points (the core model)

### User levels — the exact Old School RuneScape XP curve
- A user's level is derived from cumulative `totalXP` using the **authentic OSRS experience formula**
  (source: <https://oldschool.runescape.wiki/w/Experience>):
  ```
  xpForLevel(L) = floor( (1/4) · Σ_{ℓ=1}^{L−1} floor( ℓ + 300 · 2^(ℓ/7) ) )      // level 1 = 0 XP
  ```
  (Multiplier is **÷4**; verified L2 = ⌊332/4⌋ = 83. Compute the inner term per ℓ with its own floor, sum, then floor the ÷4 result.)
- Cumulative XP: **L2 83 · L10 1,154 · L20 4,470 · L30 13,363 · L40 37,224 · L50 101,333 · L70 737,627 · L92 6,517,253 · L99 13,034,431**. (Virtual L100 = 14,391,160; cap 200M.)
- **Max level 99** (the authentic OSRS cap). This still unlocks all 10 location tiers — tier 10 unlocks at level 91 (`floor((91−1)/10)+1 = 10`).
- Practically: trivial early (L10 ≈ ~20 tier-1 check-ins), and L99 (13M XP) is a genuine long-term grind that almost no one maxes — exactly the RuneScape feel. The formula constants live in one place (`leveling.ts`) and are not "tuned"; we keep them faithful.
- **Economy note:** with the literal curve, most users live in L1–50; reaching high levels relies on the **compounded tier→points** rewards below (T10 = 22,000), earned across many distinct locations because the **24h per-location cooldown** (confirmed) caps how much XP a player can bank per day.

### Location tiers (1–10) & visibility gating
- Each location has a **tier 1–10**.
- **Unlocked tier** for a user: `unlockedTier(level) = min(10, floor((level−1)/10) + 1)`.
  - levels 1–10 → tier 1 · 11–20 → tier 2 · 21–30 → tier 3 · … · 91–99 → tier 10 (level capped at 99). (`floor((level−1)/10)+1`: L10→1, L11→2, L40→4, L91→10.) **Every 10 levels unlocks the next tier** — matches your "under 10 → tier 1, level 40 → tiers 1–4".
- A user **sees** a location only if `location.tier ≤ unlockedTier(user.level)`. Higher-tier locations are hidden until the user levels up.

### Points (XP reward) per location — auto from tier, editable

**Compounded for the 24h-cooldown economy.** In OSRS you do thousands of small-XP actions/day (Raw shrimp = 10 XP), so 13M is reachable. Locatour gives **one check-in per location per 24h** (see cooldown below), so a player does only a handful of check-ins/day — the per-check-in XP must be far larger. Each tier's default points are anchored to the **OSRS XP "band"** that tier spans (the XP between the level it unlocks at and the next tier), divided by a target check-ins-to-clear that grows each tier:

| Tier | Unlocks @ L | OSRS band XP | ~check-ins to clear | **Default points** |
|---|---|---|---|---|
| 1 | 1 | 1,154 | 12 | **100** |
| 2 | 11 | 3,316 | 18 | **200** |
| 3 | 21 | 8,893 | 25 | **350** |
| 4 | 31 | 23,861 | 35 | **700** |
| 5 | 41 | 64,109 | 50 | **1,300** |
| 6 | 51 | 172,409 | 75 | **2,300** |
| 7 | 61 | 463,885 | 110 | **4,200** |
| 8 | 71 | 1,248,441 | 160 | **8,000** |
| 9 | 81 | 3,360,264 | 240 | **14,000** |
| 10 | 91 | 7,688,099 | 350 | **22,000** |

- `defaultPointsForTier` is this explicit lookup array (not a smooth formula) so it stays pinned to the OSRS bands. Points ≈ double per tier.
- In the admin, changing the **tier** auto-fills **points** with this default; points remain an editable slider override per location (range up to e.g. 50,000 for special events).

### Re-check-in cooldown (confirmed rule)
- After a successful check-in, a user **cannot re-check the same location for 24 hours** (`CHECKIN_COOLDOWN_H = 24`). This caps daily XP to roughly (number of accessible locations × their points), which is what makes the compounded points above necessary and the high levels a long grind.
- Enforced client-side (hide/disable check-in within the window, show "available again in Xh") and **server-side** (the authoritative dedupe/award check — ties into `03-checkin-verification-spec`).

---

## 2. Data model (Laravel `backend/`)

### `locations` (extend existing)
- `tier` (unsignedTinyInteger 1–10, default 1, indexed) — NEW
- `points` (integer; default from tier) — exists
- `geofence_radius_m` (integer, default 50, **range 50–20000**) — exists, range widened
- `latitude`, `longitude`, `address` — exist
- `status`, `submitted_by` — exist
- `image_urls` → becomes a JSON column holding an ordered mix of uploaded file paths (FileUpload, §4) and any remote seed URLs; the API resolves uploaded paths to absolute URLs via `Storage::url`.

### `categories` (NEW) — fixed, = the 9 profile interests
- `id, name, slug, icon` (Ionicons name). Seeded: hiking, camping, fishing, kayaking, birdwatching, photography, cycling, picnicking, swimming.

### `tags` (NEW) — creatable sub-labels under a category
- `id, category_id (FK), name, slug`. e.g. Hiking → "summit", "coastal trail", "loop".

### `location_tag` (NEW pivot) — Location belongsToMany Tag
- A location's **categories are derived** from `distinct(tags.category_id)`.

---

## 3. Map + geofence picker (Filament)

- Use **`cheesegrits/filament-google-maps`** (verify Filament v5 compatibility at build; fallback `dotswan/filament-map-picker` or a thin custom field if needed). Uses the existing `AIza…` Maps key.
- **Places search (Geocomplete):** type "Kings Park" → auto-fills `latitude`, `longitude`, `address`.
- **Draggable marker** to fine-tune the exact pin.
- **Geofence circle** rendered from the marker, radius bound to the **radius control** (a real slider if the Filament v5 build offers one, else a numeric field with min 50 / max 20000 / step) — the circle on the map updates live as you drag the slider.

## 4. Image upload (Filament)
- Replace pasted URLs with a **`FileUpload`** (multiple, image, reorderable) stored on the `public` disk under `locations/`. The API serves them as absolute URLs (`Storage::url`). Existing seeded `imageUrls` remain supported (the API merges remote URLs + uploaded files).

## 5. Tags in the form
- A **multi-select** (`Select::multiple()->relationship('tags')->searchable()->preload()`), **grouped by category**, with **create-new** via `createOptionForm` (name + parent category). Add one or many; create on the fly.

---

## 6. API (consumed by the app)
- `GET /api/locations` (approved-only) returns each location in the **ExploreLocation** shape plus: `tier`, `points`, `geofenceRadius`, `categories: string[]` (slugs), `tags: string[]`, `imageUrls: string[]` (absolute). Optional `?maxTier=` to let the server pre-filter; default returns all approved (app filters by level).
- CORS allows the app origin (dev).

## 7. App integration ("do both now")
- **`src/utils/leveling.ts`** (NEW): single source of truth — `levelForXP(xp)`, `xpForLevel(L)`, `xpToNext(xp)`, `unlockedTier(level)`, `defaultPointsForTier(tier)`. The exact constants live here.
- **`storage.ts`**: `getLocations()` fetches `EXPO_PUBLIC_API_URL/api/locations` with a **timeout + offline fallback to the bundled mock**; maps the API shape → `ExploreLocation` (now incl. `tier`, `tags`, `categories`, `geofenceRadius`). Replace the ad-hoc level math with `leveling.ts` (recompute `currentLevel`, `currentXPInLevel`, `xpNeededForNextLevel`, `currentXP` on every XP change).
- **Tier gating:** Explore + Home only render locations with `tier ≤ unlockedTier(user.level)` (locked ones hidden for now; "locked" styling is a later nicety).
- **Types:** extend `ExploreLocation` (`tier`, `tags`, `categories`, `geofenceRadius`) and keep `User.stats` fields, now fed by `leveling.ts`.
- **Check-in:** awards `location.points`; level/tier recomputed via `leveling.ts`. (Geofence enforcement itself = the separate `03-checkin-verification-spec`.)

---

## 8. Phased implementation
1. **Backend data model** — migrations (tier, widened radius, categories, tags, pivot), models + relations, seeders (9 categories, sample tags, 5 locations get a tier + tags), `defaultPointsForTier` helper.
2. **Filament form** — map+geocomplete+draggable+radius-circle, image FileUpload, tier slider with reactive points default, tags multi-select+create. Verify the maps plugin on Filament v5; fall back if needed.
3. **API** — Resource outputs the new fields (approved-only, absolute image URLs); CORS.
4. **App leveling module** — `leveling.ts` + unit-style sanity checks of the curve/gating.
5. **App wiring** — storage fetch+fallback+mapping, replace level math, tier-gating in Explore/Home, type updates, check-in uses real points. Verify via Playwright (web) + tsc + export.

## 9. Out of scope (now)
- Geofence *enforcement* / anti-cheat (covered by `03-…`).
- "Locked location" teaser styling, leaderboards, wallet/rewards redemption.
- Next.js public contributor site.
- Perceptual-hash image dedupe.

## 10. Risks / decisions to watch
- **Maps plugin × Filament v5** compatibility — verify first; fall back to `dotswan/filament-map-picker` or a custom Alpine map field.
- **Filament native slider** may not exist in v5 — acceptable fallback is a numeric field (min/max/step) bound to the live circle.
- **Replacing the app's level math** will shift existing demo users' displayed level — fine (mock data), but recompute from `totalXP` so nothing breaks.
- **API base URL on a physical Android device** — `localhost` won't work; use the machine's LAN IP or the Herd `locatour-api.test` domain reachable on the network (document in `.env`/`app config`).
