# Play Store Listing — paste-ready copy

**Status:** Draft listing content for the Google Play store listing, ready to
paste into Play Console → Grow → Store presence → Main store listing. Refine to
taste. Character limits noted are Google's.

---

## App name (max 30)
```
Locatour
```

## Short description (max 80)
```
A game you play by going outside. Explore real places, check in, level up.
```
*(76 chars)*

## Full description (max 4000)
```
Locatour is a game you play by going outside.

Instead of grinding levels on a couch, you level up by physically visiting
real, public places — parks, lookouts, reserves, beaches, trails, swimming
spots and hidden gems — and checking in when you get there. Every check-in
earns you experience, and experience unlocks more of the map.

Think of it as a treasure hunt across your own neighbourhood, city and state,
with the best treasures saved for the people who explore the most.

HOW IT WORKS
• Find a place — open the map and browse the locations near you.
• Go there — Locatour is played with your feet. You have to actually be at a
  place to check in.
• Check in with a photo — when you arrive, your phone confirms you're there and
  you snap a photo to mark the moment.
• Level up — each check-in rewards you, and as you level up, new and more remote
  places open up.
• Explore further — the more you play, the more of the world you can reach.

WHAT MAKES IT DIFFERENT
• Real places only. Every location is a genuine public, non-commercial place —
  owned by everyone, free to visit.
• You earn the map. The most special places stay hidden until you've put in the
  exploring to unlock them.
• It's about memories, not points. The points are just the scoreboard. The real
  reward is being somewhere you'd never have gone otherwise.

WHO IT'S FOR
Anyone who wants a reason to get out the door — solo explorers, families after a
weekend mission, locals rediscovering their own backyard, and travellers hunting
for the spots that aren't in every guidebook.

NEARBY ALERTS (OPTIONAL)
Turn on Nearby alerts and Locatour will give you a gentle nudge when you're close
to a spot you haven't visited — even when the app is closed. This is entirely
opt-in, and you can turn it off any time.

PRIVACY
Your location is used to verify check-ins and (if you opt in) to spot nearby
places. We don't sell your data or use it to track you across other apps. You can
permanently delete your account and all of your data from inside the app at any
time. Full details: https://docs.locatour.com.au/legal/privacy/

Get out there and start exploring.
```

## Listing assets needed
- **App icon** 512×512 PNG — ready at `assets/store/play-icon-512.png`
- **Feature graphic** 1024×500 PNG — generated and ready at
  `assets/store/feature-graphic.png` (brand-matched; swap for a designed version later)
- **Phone screenshots** — generated and ready in `assets/store/screenshots/`
  (1080×2160, branded background + captions):
  - `01-home.png` — "Real places near you"
  - `02-explore.png` — "Explore the map"
  - `03-checkin.png` — "Check in & earn XP"
  - `04-profile.png` — "Level up as you explore"
  Upload all four (Play needs min 2). Source screens live in
  `wiki/src/assets/screens/`; regenerate via `scratchpad`/the PIL script if the
  app UI changes. For truly fresh captures, screenshot a running build on a
  device/emulator and re-run the framing.

## Category & contact
- **Category:** Games → Adventure (or Travel & Local if you prefer the utility
  framing — `[DECIDE]`; the listing copy works for either)
- **Email:** support@hatchet.com.au
- **Website:** https://locatour.com.au
- **Privacy Policy:** https://docs.locatour.com.au/legal/privacy/

## Data Safety form — quick answers
Full rationale in `08-store-submission-guide.md` §2. In short:
- Collects: approximate + precise **location**, **photos**, **name**, **email**,
  **user ID**, **in-app activity**. Background location is **opt-in only**.
- **Shared with third parties:** No. **Sold:** No. **Encrypted in transit:** Yes.
- **Users can request deletion:** Yes — in-app, and via
  https://docs.locatour.com.au/legal/data-deletion/

## Content rating
- Complete the IARC questionnaire honestly. No violence/mature content → expect
  Everyone / PEGI 3. Flag that the app contains **user-generated content**
  (check-in photos) and **user-to-user interaction** if applicable.
- Target audience: **not** directed at children; don't opt into Designed for
  Families.
