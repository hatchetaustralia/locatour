# Locatour — Walk-and-Talk Backlog (2026-06-22)

Captured from a field walk-and-talk session. **Ownership triage** below splits items
between the **app session** (Expo/React Native, `src/`) and the **admin/backend
session** (Laravel + Filament, `backend/`). Several items are cross-cutting (need both).

> Backend note: the app already has a **contributor pending-location moderation flow**
> (admin `Users` with the `contributor` role submit locations → `status = pending` →
> staff approve). The new **Community Suggestions** here is different — it's **app
> users** (`AppUser`) suggesting from the map with **proximity enforcement**. Plan:
> a new `location_suggestions` table + a dedicated **Contributions** admin area, kept
> separate from the contributor flow; approving converts a suggestion into a Location.

## Ownership triage

| # | Item | Owner |
|---|------|-------|
| 1 | Community suggestions — submit API + proximity enforcement | **Backend** |
| 2 | Community suggestions — "Suggest Location" map UI | App |
| 3 | Contributions admin area (review/approve/reject/notes/edit/convert→Location) | **Backend** |
| 4 | Age verification — DOB validation + 13+ block on register | **Backend** |
| 5 | Age verification — DOB signup UI + messaging | App |
| 6 | Delete check-in — `DELETE /api/checkins/{id}` endpoint | **Backend** |
| 7 | Delete check-in — Profile UI + confirm modal | App |
| 8 | Dev testing utility — remove check-ins while testing | App (+ backend endpoint #6) |
| 9 | Hidden-location state reset on launch/rehydrate | App |
| 10 | Hidden-location targeting bug (nearest HIDDEN, not nearest POI) | App |
| 11 | Hidden-location radius 20 m → 50 m | App (constant) |
| 12 | Cross-tab hidden-location state persistence (Home/Map/Camera) | App |
| 13 | Home: featured "Something Hidden Nearby" hero card | App |
| 14 | Home: achievement discovery 2×2 grid | App |
| 15 | Streak: daily → weekly exploration streak | App (+ backend stat if server-side) |
| 16 | Streak: large feature card + homepage order | App |
| 17 | Challenge cards: distance instead of XP | App |
| 18 | Locked challenge: lock icon only (no level/tier) | App |
| 19 | Locked challenge: informational popup | App |
| 20 | Camera black-screen bug (init/permission/mount lifecycle) | App |
| 21 | Profile: rename "Gallery" → "Check-ins" | App |
| 22 | Achievements page: 2-col → single-column list | App |
| 23 | Check-in: passport-stamp overlay | App |
| 24 | Tutorial copy review (de-dash, human tone) | App (copy) |

**This (admin/backend) session owns: #1, #3, #4, #6** (and the backend half of #7/#8).
Everything else is app-session work.

---

## Original spec (verbatim)

### New Feature: Community Location Suggestions
Allow users to suggest new locations directly from the map.
- Near a real-world POI not already a Locatour location → suggest it.
- Tap location on map → "Suggest Location" action.
- Submit: coordinates, name (if available), optional notes.
- **Conditions:** user must be within the configured proximity radius; prevent remote submissions.

### New Admin Section: Contributions
- View pending submissions; review; approve/reject; internal notes; edit metadata before publishing.
- **On approve:** convert to a standard location; assign category; configure visibility, XP, settings; publish to map.

### Hidden Location Detection
- **Launch state reset:** on launch/rehydrate — clear hidden-location state + proximity indicators, fresh lookup, recalc nearest hidden, reapply only if criteria currently met.
- **Targeting bug:** consider only hidden locations + their geofences; exclude checked-in, normal POIs, previously discovered.
- **Radius:** 20 m → 50 m.

### Cross-tab state persistence
- Persist hidden-location state across Home/Map/Camera for a consistent experience.

### Home screen
- **Featured hidden card:** large hero when a hidden location is nearby (art + "Something Hidden Nearby"), shown across Home/Map/Camera.
- **Achievement discovery:** 2×2 grid of next achievable achievements (art + progress), focus on what's next, not locked/unlocked.

### Streaks
- Daily → **weekly** exploration streaks (discover/check-in weekly).
- Streak card: small badge → **large feature card**. Homepage order: Logo → Weekly Streak → This Month's Challenges → This Week's Top Picks.

### Challenge cards
- Show **distance** (e.g. "1.2 km away") instead of XP.
- Locked: **lock icon only** (no level/tier).
- Locked tap: informational modal encouraging progression (no level numbers).

### Camera
- Black-screen bug: review init lifecycle, permission state, mount/unmount, tab nav.

### Profile
- Rename "Gallery" → **"Check-ins"**.
- **Delete check-in:** Profile → Check-ins → select → Delete, with confirm modal. Supports privacy/ownership/future social + QR.
- **Dev test mode:** remove check-ins while testing.

### Achievements page
- 2-column → **single-column** full-width list, vertical scroll, longer cards.

### Check-in experience
- Add **passport-style stamp** overlay (Checked In / Discovered / Verified / Explorer Stamp).

### Tutorial copy
- Remove excessive dashes; avoid AI-sounding language; natural, concise, human.

### Age verification
- Min age **13+**. Add DOB (day/month/year) at registration. ≥13 continue, <13 blocked.
- Message: "Locatour is currently available for users aged 13 and above."
- Future: parent consent, teen experiences, enhanced verification.
