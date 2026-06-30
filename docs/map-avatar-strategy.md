# Map "you are here" avatar — strategy & decision doc

**Status:** open decision. Written 2026-06-30 after ~20 failed attempts cycling between two bad trade-offs.
**Related:** memory `locatour-map-avatar-bug` (full saga + every commit), `src/app/(tabs)/index.tsx` (current overlay), `src/components/user-avatar-marker.tsx` (retired baked-marker hook).

---

## 1. The requirement

Render the user's location indicator on the map such that it is **all three** of:

- **R1 — Smooth:** tracks the map in lock-step during pan/zoom (no lag/trailing).
- **R2 — Reliable:** never blank / white / black / vanishing. Survives cold load, tab switches, AND the GPU-heavy **camera → map** transition.
- **R3 — Custom:** the player's actual avatar photo in a ring, with a rainbow "hidden gem nearby" halo state. (This is a Pokémon-Go-style game — the avatar puck is brand-core, not decoration.)

No single approach in `react-native-maps` satisfies all three. **That is the whole problem.** We keep trading R1 for R2 and back.

---

## 2. Everything we've tried (the trade-off matrix)

| # | Approach | R1 smooth | R2 reliable | R3 custom | Outcome |
|---|----------|:---------:|:-----------:|:---------:|---------|
| 1 | View-child `<Marker>` (avatar `<Image>` inside a Marker) | ✓ | ✗ white on cold load, vanishes on tab switch | ✓ | **failed** |
| 2 | Native `<Marker image>` of a baked PNG (Skia) | ✓ | ✗ **disappears** (renders nothing) after the camera→map transition | ✓ | **failed** (latest; confirmed on-device via diagnostic 2026-06-30 — all gates ✓, avatar absent) |
| 3 | Projected RN overlay `<View>` (`pointForCoordinate` → absolute pos) | ✗ **lags** a few frames on pan | ✓ a View can't go black | ✓ | **current** — reliable but laggy (user dislikes) |
| 4 | `showsUserLocation` (native blue dot) | ✓✓ | ✓✓ | ✗ blue dot, un-styleable on Android | not tried — bulletproof but no avatar |

Location **pins** (not the avatar) hit the same #1/#2 failure — they went black after the camera too; patched 2026-06-30 by forcing `tracksViewChanges` true for ~1.6s on focus to re-rasterise. That's a band-aid on the same root cause.

---

## 3. Root cause (the actual bottom of it)

`react-native-maps` renders a custom marker by **snapshotting the RN view subtree to a static bitmap** (or taking one `image`) and handing that bitmap to the native Google Maps marker. That bitmap is:

1. **Unreliable to capture** — white/blank before async or remote content paints (failure #1), and
2. **Discarded when the map's GL surface is recreated** — e.g. returning from the GPU-heavy `expo-camera` — and with `tracksViewChanges={false}` it is never re-rasterised (failure #2, the black marker).

The **overlay** (#3) sidesteps markers entirely, but it is positioned on the **JS thread** via an async `pointForCoordinate` bridge call, so it trails the 60fps native camera by a few frames during a pan. `react-native-maps` does **not** expose the live camera/region as a Reanimated shared value, so the overlay **cannot** be driven on the UI thread to fix the lag.

> **Conclusion:** within `react-native-maps`, **R1 + R2 + R3 are mutually unsatisfiable for a custom avatar.** It is a library-architecture limitation, not a bug we can keep patching. This is why ~20 attempts converged on "pick which of two flaws you hate less."

---

## 4. Strategic options

### Option A — Native blue dot (`showsUserLocation`)
Drop the custom avatar; use the map's own native location layer.
- **R1 ✓✓ R2 ✓✓ R3 ✗** (blue dot; not styleable to the avatar on Android).
- **Effort:** ~1 hour. **Risk:** none. **Ship:** OTA.
- **Question it forces:** is the custom avatar worth a migration, or is a reliable dot good enough?

### Option B — Migrate the map to Mapbox (`@rnmapbox/maps`) ⭐ likely the real fix
Mapbox's `MarkerView` composites a **real RN view as a native annotation** — NOT a snapshot bitmap — so it tracks in lock-step **and** can't go black/blank. Satisfies **R1 + R2 + R3 together.**
- **Effort:** ~2–4 days. **Risk:** medium.
- **Cost:** Mapbox account + access token; a **native rebuild** (not OTA-able); replace `MapView`/`Marker` across `index.tsx` (+ camera proximity reads, any other map usage); re-style the map in Mapbox's style spec; free tier = 50k MAU then paid.

### Option C — Evaluate `expo-maps` (in-ecosystem)
Expo's new native maps module (SDK 52+; Google Maps on Android via the new Maps SDK). Newer marker model that *may* render custom markers reliably. Less mature/feature-complete than react-native-maps/Mapbox; no new account needed.
- **Effort:** spike ~½ day; migration ~1–3 days if markers pass. **Risk:** medium (maturity).

### Option D — Keep the overlay, kill the lag on the UI thread
Compute the mercator projection in a Reanimated worklet from the map region.
- **Blocked:** react-native-maps doesn't expose region as a shared value → would need a library patch/fork. **Not recommended.**

---

## 5. Recommendation

Stop fighting react-native-maps. Because the custom avatar is brand-core (R3 matters), the path to actually solving R1+R2+R3 is a **different map renderer**:

1. **Spike Option C (expo-maps) first** — half a day, no new deps. Build a throwaway screen with a custom avatar marker; test the three failure scenarios. If it's smooth **and** survives camera→map, migrate to it.
2. **If expo-maps markers aren't reliable, commit to Option B (Mapbox `MarkerView`)** — the one architecture proven to give smooth + reliable + custom simultaneously.
3. **Interim:** if we need it bulletproof *this week* with zero migration, ship **Option A (blue dot)** as the floor and schedule the migration as proper work. (Today's overlay is the other acceptable interim — reliable, just laggy.)

**Do NOT** attempt another react-native-maps marker variant. The matrix above is exhausted.

---

## 6. Spike plan (1 day, evidence before migrating)

For each candidate (expo-maps, then rnmapbox if needed), build a minimal map screen and record PASS/FAIL:
- [ ] Pan/zoom: does the avatar stay lock-step (R1)?
- [ ] Tab → camera → back: does it survive (R2)?
- [ ] Cold app load: no white/black flash (R2)?
- [ ] Custom avatar image + a halo state renders (R3)?

Decide from the table, not from guesses.

---

## 7. Decision needed (from Daniel)

1. **Avatar vs effort:** is the custom avatar puck worth a 2–4 day renderer migration, or is the native blue dot acceptable? → picks **A** vs **B/C**.
2. **Native rebuild appetite:** OK to do a fresh build + map re-style for Mapbox? → gates **B**.
3. **Timeline:** ship a bulletproof interim (blue dot / keep overlay) now, or hold for the migration?
