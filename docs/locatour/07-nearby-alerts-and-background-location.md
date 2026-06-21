# Nearby Alerts & Background Location — Spec + Release Checklist

**Status:** Implemented feature; this doc captures behaviour, the store-compliance
requirements, and the release checklist. Internal — not the public wiki. The
player-facing version lives at `wiki/src/content/docs/play/nearby-alerts.md`.

**Audience:** App engineers (Expo/RN), release manager, product.

---

## 1. What it is

Background geofence proximity notifications. When a user wanders near a spot —
even with the app closed — the OS fires a low-power notification:

- **"Closing in… 🔍"** for **hidden** (not-yet-unlocked/found) spots at ~500m.
- **"📍 Spot nearby!"** for **unlocked** spots at ~120–150m.

Goal: ambient/passive discovery as users go about their day. This is the app's
primary stickiness / anti-churn mechanism.

## 2. Opt-in model (store-friendly)

- **OFF by default.** The app **never** requests "Allow all the time" location on
  its own. Default installs use foreground ("while using") location only.
- Enabled via a **"Nearby alerts" toggle in Profile → Overview**.
- Turning it ON shows a **prominent in-app disclosure** (an alert) **before** the
  OS permission prompt, explaining:
  - what background location does,
  - the points bonus,
  - that location is only matched against nearby spots and never tracked/shared,
  - that it's reversible.
- On **Android 11+** the OS sends the user to **Settings** to pick "Allow all the
  time" (background location can't be granted from an in-context dialog).

## 3. Incentive

- While enabled, **+50% points multiplier on every check-in**
  (`NEARBY_ALERTS_POINT_MULTIPLIER = 1.5` in `src/utils/leveling.ts`).
- **Stacks** with the **3× first-find discovery bonus**.
- Surfaced as a **"+50% pts" pill** on the toggle.

## 4. Throttling (rare delight, not spam)

- **Per-spot cooldown:** 30 days (no re-ping for the same spot within a month).
- **Daily cap:** 3 notifications/day.
- **Quiet hours:** suppressed 21:00–08:00 local.
- **State** persisted in a dedicated SQLite DB **`locatour-geofence.db`**,
  separate from the main app DB so the headless geofence task can read/write it
  safely.

## 5. How it works (mechanics + power)

- **Android geofencing via Google Play Services:** event-driven, OS-batched
  (cell/wifi/significant-motion). **Not GPS polling** — that's why it's
  battery-light.
- Registers up to **90 regions** for discoverable, never-visited spots.
- Requires a **dev/standalone build + physical device** (no Expo Go / emulator).

## 6. Permissions

- Foreground **"while using"** location: always (needed for map/camera).
- Background **`ACCESS_BACKGROUND_LOCATION`**: requested **only when the user
  opts in**.

## 7. Play Store release checklist

Background location is **high-scrutiny** on Google Play. Before shipping a build
that requests `ACCESS_BACKGROUND_LOCATION`:

- [ ] **Prominent in-app disclosure** shown before the OS prompt. *(Done — the
      opt-in alert.)*
- [ ] **Play Console background-location declaration** completed in the app
      content / permissions form.
- [ ] **Demo video** showing the disclosure → permission → feature flow, as
      required by the declaration.
- [ ] **Written justification** of why the core feature needs background
      location (ambient nearby-spot discovery).
- [ ] **Privacy policy** publicly hosted and covering background location.
      *(Drafted — `wiki/.../legal/privacy.md` §3; fill placeholders + legal
      review before publish.)*
- [ ] Confirm the manifest only requests background location on builds that ship
      the feature, and that foreground-only installs never trigger the
      "all the time" request.
- [ ] Data safety section reflects: location collected, used for app
      functionality, **not shared**, optional.

### Apple notes (if/when iOS ships this)

- iOS uses "Always" location authorization + region monitoring. Needs
  `NSLocationAlwaysAndWhenInUseUsageDescription` / `NSLocationWhenInUseUsageDescription`
  strings that clearly explain the nearby-alerts purpose. Apple review also
  scrutinises Always-location justification.

## 8. Cross-references

- Player-facing doc: `wiki/src/content/docs/play/nearby-alerts.md`
- Privacy: `wiki/src/content/docs/legal/privacy.md` §3
- Trust summary: `wiki/src/content/docs/trust/data-and-security.md`
- Multiplier constant: `src/utils/leveling.ts` (`NEARBY_ALERTS_POINT_MULTIPLIER`)
- Check-in verification (foreground geofence): `03-checkin-verification-spec.md`
