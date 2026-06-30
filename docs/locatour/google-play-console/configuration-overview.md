# Google Play Console — Configuration Overview

**Status:** Live record of every setting/answer used to publish Locatour to the
Google Play Store (2026-06-29). Keep this updated as the listing changes. Most of
it carries over to the **Apple App Store** — Apple equivalents are noted inline as
**[Apple]**.

> **Not legal advice.** Data Safety / privacy answers reflect the app's actual
> behaviour as of this date — re-verify if you add SDKs (analytics/crash/ads) or
> new data collection.

---

## 1. Account & app identity
- **Developer account:** Hatchet Developers (Organization), account ID `7429237581670101068`, owner **support@hatchet.com.au**. (Note: `daniel@hatchet.com.au` is a *personal* Google account with no console — `/u/0/` in console URLs points at it, the org is usually `/u/1/`.)
- **App name:** Locatour
- **Package name:** `com.hatchet.locatour` — **[Apple]** bundle id `com.hatchet.locatour`
- **Category:** Games → Adventure
- **Tags:** **Adventure + Casual** (Play has no "Exploration"/"Open world" tag)
- **Default language:** English (US)
- **App or game:** Game · **Free**
- **Legal entity / jurisdiction:** Hatchet Pty Ltd / Western Australia
- **D-U-N-S number:** `744044857` (Hatchet Pty Ltd) — **[Apple]** required for Organization enrolment; look up / confirm via Apple's own tool at https://developer.apple.com/enroll/duns-lookup/ (not D&B's US-only ZIP search).

## 2. Build & release
- **Build:** `npx eas-cli build -p android --profile production` → AAB, `versionCode` auto-increments, all 4 ABIs (`EXPO_ANDROID_ABIS` env in `eas.json`), runtimeVersion `3a5735b1…` (fingerprint). Install size ~40 MB (Play splits per-device).
- **Track:** **Internal testing** (no review) is live. Testers = "Developers" email list (bradie/daniel/glenn/matt @hatchet.com.au).
- **OTA (JS-only changes):** `eas update --channel production --environment production` (the `--environment` flag is REQUIRED in `--non-interactive`).
- **App signing:** Play App Signing (Google manages the key). **Play Games Sidekick = NO** (no Play Games Services integration).

## 3. App signing SHA-1 → Google Sign-In (critical gotcha)
Play re-signs installs with the **Play App Signing key**, whose SHA-1 must be in a Google Cloud **Android OAuth client** or Google Sign-In throws `DEVELOPER_ERROR` (the app misreports it as "Couldn't reach the server").
- **Get the SHA-1:** Play Console → **Protected with Play → Play Store protection → Manage Play App Signing** → "App signing key certificate" SHA-1. (The old `/app-signing` URL is dead; "App integrity" redirects here.)
- **Add it:** Google Cloud Console → APIs & Services → Credentials → **create a new Android OAuth client** (package `com.hatchet.locatour` + that SHA-1). Propagates in minutes, no rebuild.
- The **Web** OAuth client (`497605846776-r399…`) is the `webClientId` baked into the app — leave it.

## 4. App access (Sign in details) — reviewer bypass
The app is **Google-Sign-In-only**; reviewers can't use Google Sign-In. Answer **"Yes, part of the app is restricted"** and provide a demo bypass:
- **Name:** Reviewer demo access · username/password **blank**
- **Any other info:**
  > This app uses Google Sign-In only. On the sign-in screen, tap the "Locatour"
  > logo **5 times** to reveal a "Reviewer code" field. Enter code **`rev-locatour-4827`**
  > and tap "Reviewer sign-in" — signs into a pre-populated demo account, no Google needed.
- **How it works:** hidden logo-tap → `signInWithDemo()` → `POST /api/auth/demo` (secret `DEMO_LOGIN_CODE` env on prod, constant-time compared) → token for a sandboxed pre-onboarded demo `AppUser` (`reviewer@locatour.com.au`, home base Perth WA 6000). Verified live. **[Apple]** reuse the same logo-tap + code path.

## 5. Target audience and content
- **Target age:** **13-15, 16-17, 18 and over** (i.e. 13+). **Never** tick under-13 (pulls you into Designed-for-Families/COPPA, incompatible with background location + photos).
- **Appeal to children:** **No** — general-audience game, not directed at kids. Don't opt into Designed for Families.

## 6. Data safety (full answers)
- **Collects data:** Yes · **Encrypted in transit:** Yes (HTTPS) · **Account creation:** **OAuth** only (add "Username and other authentication" if/when phone sign-in ships).
- **Shared with third parties:** **No** (nothing) · **Sold:** No.
- **Delete account URL:** `https://docs.locatour.com.au/legal/data-deletion/`
- **Partial data deletion without deleting account:** **Yes** (users can delete individual check-ins — `DELETE /checkins/{id}`).
- **Privacy policy:** `https://docs.locatour.com.au/legal/privacy/`

**Data types** — for every type: **Collected = Yes, Shared = No, Ephemeral = No** (all stored server-side). Purposes/required as below:

| Data type | Required? | Purpose |
|---|---|---|
| Location → **Approximate location** | Optional | App functionality |
| Location → **Precise location** | Optional | App functionality |
| Personal info → **Name** | Required | App functionality + Account management |
| Personal info → **Email address** | Required | App functionality + Account management |
| Personal info → **User IDs** | Required | App functionality + Account management |
| Personal info → **Other info** (gender, interests) | Optional | App functionality |
| Photos and videos → **Photos** | Required | App functionality |
| App activity → **App interactions** | Required | App functionality |
| **Device or other IDs** | Optional | App functionality |

Rules of thumb: nothing "Shared", nothing "Ephemeral" (check-ins store `latitude/longitude/gps_accuracy`; home base stores `home_lat/lng`); only background-location, gender/interests and device IDs are "Optional". Location purpose is **App functionality only** (not Account management).

## 7. Content rating (IARC)
Complete the questionnaire honestly: no violence/sexual/profanity/drugs/gambling. **Yes** to user-generated content (check-in photos) + user interaction. Expect **Everyone / PEGI 3**. Ads = No. Government/Financial/Health = No.

## 8. Store listing
- **App name:** `Locatour`
- **Short description (≤80):** `A game you play by going outside. Explore real places, check in, level up.`
- **Full description:** see `docs/locatour/12-play-store-listing.md` (paste-ready, ≤4000).
- **App icon (512×512):** `./app-icon-512.png`
- **Feature graphic (1024×500):** `./feature-graphic-1024x500.jpg`
- **Phone screenshots (1080×1920, 9:16):** `./screenshots/01-map.png … 06-history.png` (6 shots, framed from **real device screenshots**; the map is the hero). The same files satisfy **7-inch and 10-inch tablet** specs too (1080–7680px) — reuse them there.
- (All graphics + a designer brief live in this folder — see `./README.md`.)
- **Video:** optional YouTube URL (public/unlisted, ads off, not age-restricted).

## 9. Remaining before PUBLIC (Production) release
Internal testing is live now. To go public (Production = reviewed):
1. 🎥 **Background-location demo video** (sensitive-permission declaration) — see `docs/locatour/09-…md`. Film: enable Nearby alerts → in-app disclosure → OS "Allow all the time" → background the app → notification fires → tap it. Upload unlisted to YouTube; link in the declaration.
2. Confirm reviewer bypass (§4) is documented in App access.
3. **Test and release → Production → Create release** → upload AAB → review → roll out (staged % recommended). Review takes hours–~7 days.
4. Pick countries/regions (AU-first or worldwide).

## 10. Apple App Store — what carries over
Most of the above maps to App Store Connect:
- **App Privacy "nutrition labels"** ≈ Data Safety. Same data types; **none "Used to Track You"** (no tracking SDKs) — all "Data Linked to You", purpose App Functionality / Account.
- **App Review sign-in** ≈ App access → use the same **logo-tap + `rev-locatour-4827`** demo bypass (put it in App Review notes).
- **Background location** — Apple also scrutinises Always location; explain the opt-in Nearby-alerts purpose in review notes; ensure purpose strings (`app.json` infoPlist) are clear.
- **Sign in with Apple** — Apple *requires* it once you offer Google sign-in; the login screen already has a (currently disabled) Apple button to wire up.
- **Export compliance:** set `ios.infoPlist.ITSAppUsesNonExemptEncryption = false` (standard HTTPS only) to skip the per-build prompt.
- **Age rating questionnaire** ≈ content rating; expect 4+/12+.
- Reuse the icon, screenshots (Apple wants specific device sizes), descriptions, privacy/deletion URLs.

## Cross-references
`08-store-submission-guide.md` (both stores) · `09-…` (bg-location video) · `11-publishing-runbook.md` (DNS/hosting) · `12-play-store-listing.md` (listing copy + assets).
