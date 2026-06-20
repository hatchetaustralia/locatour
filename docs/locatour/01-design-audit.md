# Locatour — Design Audit & Gap Analysis

**Source of truth:** Figma file `Locatour 2` → board **"Mobile UI 2"** (node `336:647`, file key `ggmUGOX5tNYKzaperWocKN`).
**Code audited:** `src/app/**`, `src/components/**`, `src/utils/storage.ts`, `src/types/index.ts` (Expo SDK 55 / RN 0.83, expo-router, all data currently client-side mock).
**Date:** 2026-06-19.

The board contains **32 screens + 1 Nav component + 2 sticky notes** (34 frames total). All frames are 400px wide (heights 650–923).

---

## Status legend
- ✅ **Built** — screen exists in code and broadly matches the design intent
- 🟡 **Partial** — some of this exists, but states/details are missing
- ❌ **Missing** — no code for this yet

---

## A. Auth / Onboarding — ✅ mostly built

| # | Figma screen | node ID | Code file | Status |
|---|--------------|---------|-----------|--------|
| 1 | Mobile - Login page | `336:648` | `src/app/auth/login.tsx` | ✅ (social-first state) |
| 2 | Mobile - Login page - Email | `336:836` | `src/app/auth/login.tsx` | ✅ (email-entry state of same screen) |
| 3 | Mobile - Login page - TOTP | `336:1019` | `src/app/auth/otp.tsx` | ✅ |
| 4 | Mobile - Login page - Profile | `336:1205` | `src/app/auth/profile.tsx` | ✅ |
| 5 | Mobile - Login page - Customise | `336:1237` | `src/app/auth/customize.tsx` | ✅ |
| 6 | Mobile - Login page - Customise - Selected | `361:1175` | `src/app/auth/customize.tsx` | ✅ (selected state) |

**Caveat:** the UI exists but **auth is entirely mocked** — social login jumps straight to profile, OTP isn't verified against anything, no token/session. Real auth is a backend concern (see architecture plan).

---

## B. Home / Dashboard — ✅ built

| # | Figma screen | node ID | Code file | Status |
|---|--------------|---------|-----------|--------|
| 7 | Home | `336:1519` | `src/app/index.tsx` | ✅ |
| 8 | Home | `336:1659` | `src/app/index.tsx` | ✅ (second state — likely scroll/variant) |

Need to diff visually to confirm the two Home frames are just states vs. a redesign. Current `index.tsx` has welcome card, XP bar, streak, top-picks carousel, challenges list.

---

## C. Check-in flow — ❌ MISSING (this is the core loop)

| # | Figma screen | node ID | Code file | Status |
|---|--------------|---------|-----------|--------|
| 9 | Check in | `336:1741` | — | ❌ (camera viewfinder) |
| 10 | Check in - photo taken | `340:643` | — | ❌ |
| 11 | Check in - verifying | `342:561` | — | ❌ (verification in progress) |
| 12 | Check in - verified | `340:1618` | — | ❌ (success / points awarded) |
| 13 | Check in - verified | `351:4715` | — | ❌ (variant) |

**The entire 5-screen check-in flow is unbuilt.** `expo-camera` is installed but never imported. `storage.ts` has `queueOfflineCheckIn()` / `addCheckIn()` but no UI calls them. The `camera` tab in `app-tabs.tsx` points at a route (`camera`) that **does not exist** → navigation breaks. This is the single most important gap — it's the game's primary action.

---

## D. Map / Location detail — 🟡 partial

| # | Figma screen | node ID | Code file | Status |
|---|--------------|---------|-----------|--------|
| 14 | Map | `336:1764` | `src/app/explore.tsx` | ✅ (map + custom pins built) |
| 15 | Welcome back view | `336:3512` | — | 🟡 (map entry/overlay state) |
| 16 | Welcome back view | `362:1416` | — | 🟡 (variant) |
| 17 | Selected Location | `340:1075` | `src/app/explore.tsx` (bottom sheet) | 🟡 (sheet exists, may not match) |
| 18 | Checked in location | `347:2133` | — | 🟡 (post-check-in detail state) |
| 19 | Checked in location | `349:3528` | — | 🟡 (variant) |
| 20 | Previous Check Ins | `351:4056` | — | ❌ → **this is the History tab** |
| 21 | View Checked in location | `356:1849` | — | ❌ (detail of a past check-in) |

`explore.tsx` covers the map + pins + a bottom sheet + Haversine distance + check-in status lookup. The richer **location-detail states** (checked-in, welcome overlay) and the **Previous Check-ins / History** screens are not built. History tab route is missing.

---

## E. Profile — ❌ mostly missing (in-app)

| # | Figma screen | node ID | Code file | Status |
|---|--------------|---------|-----------|--------|
| 22 | Edit Profile | `336:1851` | — | ❌ |
| 23 | Edit Profile | `342:610` | — | ❌ |
| 24 | View Profile | `354:1401` | — | ❌ |
| 25 | Edit Profile | `356:3793` | — | ❌ |
| 26 | Edit Profile | `356:3970` | — | ❌ |
| 27 | Edit Profile | `377:1091` | — | ❌ |
| 28 | Edit Profile | `377:3221` | — | ❌ |
| 29 | Profile Categories | `355:1590` | — | ❌ |
| 30 | Edit Profile | `354:1267` | — | ❌ |
| 31 | Edit Profile | `342:1048` | — | ❌ |

10 profile frames in design (many edit states/variants). Code only has the **onboarding** profile (`auth/profile.tsx`), not an in-app **View Profile**, **Edit Profile**, or **Profile Categories** screen. The `profile` tab route is missing at top level (`router.push('/profile')` in `index.tsx` currently has no target). `storage.updateProfile()` exists but is unused.

---

## F. Navigation component

| # | Figma | node ID | Code | Status |
|---|-------|---------|------|--------|
| 32 | Nav | `336:3232` | `src/components/app-tabs.tsx` | 🟡 |

Tab bar declares **5 tabs**: `index` ✅, `explore` ✅, `camera` ❌ (no screen), `history` ❌ (no screen), `profile` ❌ (no top-level screen). 3 of 5 tabs are broken routes.

---

## Coverage summary

| Area | Design screens | Built | Gap |
|------|---------------:|------:|-----|
| Auth / Onboarding | 6 | 6 | UI done; real auth missing (backend) |
| Home | 2 | 2 | confirm variants |
| **Check-in (core loop)** | **5** | **0** | **entire flow + camera tab** |
| Map / Location detail | 8 | ~2 | detail states + History |
| Profile | 10 | 0 (in-app) | View/Edit/Categories + profile tab |
| Nav | 1 | partial | 3 broken tab routes |
| **Total** | **32** | **~10** | **~22 screens** |

**~30% of the designed surface is built.** The biggest, highest-value gaps are: (1) the **check-in flow** (the actual game), (2) **History / Previous Check-ins**, (3) the **in-app Profile** surface — which map exactly to the 3 broken tabs.

---

## Immediate correctness issues (independent of design)
1. `app-tabs.tsx` references routes `camera`, `history`, `profile` with **no matching screen files** → broken nav / type errors (typedRoutes is on).
2. `index.tsx` calls `router.push('/profile')` → **no `/profile` route** exists.
3. `expo-camera` is a dependency but **unused**.
4. All persistence is **local mock** (`storage.ts` singleton + SQLite offline queue + localStorage web fallback). No server.

## What needs a per-screen design pull (during build, via `get_design_context`)
The check-in flow (`336:1741`, `340:643`, `342:561`, `340:1618`), Previous Check-ins (`351:4056`), View Profile (`354:1401`), Profile Categories (`355:1590`), and the location-detail states (`347:2133`, `340:1075`). I have the node IDs ready to extract exact layout + tokens when we implement each.
