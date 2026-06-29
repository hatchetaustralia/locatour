# App Store Submission Guide — Google Play & Apple App Store

**Status:** Working guide for first submission. Internal (engineering/release),
not the public wiki. **Not legal advice** — store requirements change; verify
against the live Play Console and App Store Connect at submission time.

**Grounded in the app's actual config** (verified 2026-06):

- SDKs that touch user data: `expo-camera`, `expo-location` (foreground **and**
  background), `expo-notifications`, `expo-sqlite`. **No analytics, crash-
  reporting, advertising, or tracking SDKs.** → Nothing is sold or shared with
  third parties; no cross-app tracking.
- Permission strings already set in `app.json` (see §5).
- `isAndroidBackgroundLocationEnabled: true` → the build requests
  `ACCESS_BACKGROUND_LOCATION` (high-scrutiny — see §4 and `07-…`).

---

## 0. The short version — what you actually submit

| Item | Google Play | Apple | Where it is |
|---|---|---|---|
| **Privacy Policy URL** | Required | Required | `docs.locatour.com.au/legal/privacy/` (draft — fill placeholders) |
| **Terms URL** | Optional | Optional | `docs.locatour.com.au/legal/terms/` |
| **Support URL / email** | Required | Required | `[SUPPORT_EMAIL]` / a support page |
| **Data Safety / App Privacy** | Data Safety form | App Privacy labels | §2 / §3 below |
| **Permission justifications** | Background-location declaration + demo video | App Review notes | §4 |
| **Demo account** | App access section | App Review notes | §6 |
| **Content / age rating** | IARC questionnaire | Age rating questionnaire | §7 |
| **Listing metadata** | Store listing | Product page | §8 |

**Blocking gaps to resolve before you can submit — see §9.** The big ones:
fill the legal-page placeholders, host the site, confirm **in-app account
deletion**, and prepare the **background-location demo video**.

---

## 1. Public URLs (host these first)

Both stores require a **publicly reachable** privacy policy URL. Apple and Google
both fetch it during review.

- **Privacy Policy:** `https://docs.locatour.com.au/legal/privacy/`
- **Terms:** `https://docs.locatour.com.au/legal/terms/`
- **Support:** a reachable email (`[SUPPORT_EMAIL]`) and ideally a support/contact
  page.

These live in the wiki (`wiki/`). They are **drafts with placeholders**
(`[LEGAL_ENTITY_NAME]`, `[SUPPORT_EMAIL]`, `[GOVERNING_LAW_JURISDICTION]`,
`[EFFECTIVE_DATE]`) and need fill-in + legal review **and** the site deployed to
`docs.locatour.com.au` before submission.

---

## 2. Google Play — Data Safety form

Based on the app's real data use. Answers assume no third-party data SDKs (true
today — re-check if you add analytics/crash/ads later).

**Does your app collect or share any user data?** Yes (collect). **Sold?** No.
**All data encrypted in transit?** Yes (HTTPS). **Way to request deletion?** Yes
(see §9 — must be real).

| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| **Approximate location** | Yes | No | Required for check-in | App functionality |
| **Precise location** | Yes | No | Required for check-in; background portion optional (Nearby alerts) | App functionality |
| **Photos** (check-in photos) | Yes | No | Required to check in | App functionality |
| **Name** | Yes | No | Required | Account management |
| **Email address** | Yes | No | Required | Account management |
| **User IDs** | Yes | No | Required | Account management |
| **App interactions / in-app activity** (check-ins, XP, achievements) | Yes | No | Required | App functionality |
| **Crash logs / diagnostics** | Only if you add a crash SDK | — | — | Re-answer if added |

Notes:

- **Location** must be flagged collected with both *approximate* and *precise*.
  The **background** use (Nearby alerts) is **optional/opt-in** — reflect that.
- **Photos:** collected, not shared, app functionality. (They form the user's
  check-in history.)
- **No advertising or analytics data**, **no data shared with third parties**,
  **no data sold** — keep this true or update the form.

---

## 3. Apple — App Privacy ("nutrition label")

Declared in App Store Connect. With no tracking SDKs, **nothing is "Used to
Track You."** Everything below is **"Data Linked to You"** (tied to the account),
**not** used for tracking.

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| **Precise Location** | Yes | Yes | No | App Functionality |
| **Coarse Location** | Yes | Yes | No | App Functionality |
| **Photos or Videos** (User Content) | Yes | Yes | No | App Functionality |
| **Name** | Yes | Yes | No | App Functionality / Account |
| **Email Address** | Yes | Yes | No | App Functionality / Account |
| **User ID** | Yes | Yes | No | App Functionality / Account |
| **Product Interaction** (gameplay) | Yes | Yes | No | App Functionality |

- **Tracking:** None. Do **not** enable App Tracking Transparency data types
  unless you add a tracker.
- **Account deletion** must be offered in-app (§9).

---

## 4. Permissions & the background-location declaration

The app requests three sensitive capabilities:

| Permission | When requested | Store handling |
|---|---|---|
| Location **while using** (`ACCESS_FINE_LOCATION` / WhenInUse) | On first check-in | Standard; justified by the core check-in feature |
| **Background** location (`ACCESS_BACKGROUND_LOCATION` / Always) | **Only** when user opts into Nearby alerts | **High-scrutiny — extra steps below** |
| **Camera** | On first check-in photo | Standard; justified by check-in photo |
| **Notifications** | For Nearby alerts / reminders | Runtime prompt (Android 13+ / iOS) |

### Google Play background-location declaration (required)

Because the manifest includes `ACCESS_BACKGROUND_LOCATION`, Play requires a
declaration in the **App content → Sensitive permissions** section:

- [ ] **Prominent in-app disclosure** shown *before* the OS prompt. *(Done — the
      Nearby-alerts opt-in alert.)*
- [ ] **Written justification:** core feature = ambient discovery; the app must
      detect proximity to nearby spots while closed to notify the user.
- [ ] **Demo video** (public/unlisted URL) showing: feature in app → in-app
      disclosure → OS permission → notification firing. **Not yet created.**
- [ ] Confirm the app **does not** request "Allow all the time" on default
      installs (it doesn't — opt-in only).

### Apple App Review notes (for Always location)

- Explain in **App Review notes** that Always/background location powers the
  optional "Nearby alerts," is opt-in, and gates behind an in-app explanation.
- Make sure the purpose strings (§5) clearly state the user benefit.

Full feature/mechanics detail and the per-spot throttling: see
`07-nearby-alerts-and-background-location.md`.

---

## 5. Permission purpose strings (already in `app.json`)

These are live in the project and will appear at the OS prompt. Review wording
before submission:

- **Camera** — "Locatour needs camera access so you can take a photo to check in
  at a location."
- **Location (when in use)** — "Locatour uses your location to verify you are at
  a check-in spot."
- **Location (always / always-and-when-in-use)** — "Locatour watches for nearby
  spots in the background so it can nudge you when you're close to one — even
  hidden ones."

`[CONFIRM]` whether a notifications usage string / Photo Library string is needed
— current flow is in-app capture only (no library save), so a Photo Library
permission should not be required. If you add "save photo to library," add
`NSPhotoLibraryAddUsageDescription`.

---

## 6. Demo / test account (both stores)

Both reviewers need to get past login. Locatour requires an account, so:

- Provide **working demo credentials** (Play: *App access*; Apple: *App Review
  → Sign-In information*).
- Ensure the demo account can reach real content. **Note:** check-in and Nearby
  alerts need real GPS / a physical location — call this out in the review notes
  and, ideally, provide a way for the reviewer to see the flow (the demo video
  covers Play; add notes for Apple).
- `[CONFIRM]` if any social-login providers are enabled — see §9 (Sign in with
  Apple rule).

---

## 7. Ratings & audience

- **Google Play:** complete the **IARC content-rating questionnaire**. Locatour
  has no violence/mature content → expect **Everyone / PEGI 3**-style rating.
  Confirm answers about user-generated content (photos) and user interaction.
- **Apple:** complete the **age-rating questionnaire**. Likely **4+**, but
  user-generated content + location sharing between users (if any) can push it
  to **12+** — answer honestly.
- **Target audience:** **not** directed to children (matches the Privacy Policy's
  children's section). Don't opt into Play's "Designed for Families."
- **User-generated content:** the app stores user photos → both stores expect a
  way to **report/moderate** UGC. `[CONFIRM]` the moderation/report path
  (tie-in to the contributor/moderation system).

---

## 8. Store listing metadata (draft)

Reuse the wiki's brand voice. Drafts to refine:

- **App name:** Locatour
- **Subtitle / short description:** "Creating memorable experiences." /
  "Explore real places, check in, level up."
- **Full description:** adapt `wiki/.../start/what-is-locatour.md` +
  `memorable-experiences.md` (the core loop, public-places mission, hidden
  locations, privacy-forward).
- **Category:** Travel or Games (Adventure). `[DECIDE]`
- **Keywords (Apple):** exploration, outdoors, parks, check-in, hiking, travel,
  adventure, discovery, walking, nature. `[REFINE]`
- **Screenshots:** required per device class — use the `emu-*`/`v4-*` captures in
  the repo root as a starting set; produce final framed shots.
- **App icon, feature graphic (Play):** `[NEEDED]`.
- **Privacy Policy URL / Support URL:** from §1.

---

## 9. Pre-submission gaps (blocking) — fix these first

1. **Fill legal placeholders + legal review.** `[LEGAL_ENTITY_NAME]`,
   `[SUPPORT_EMAIL]`, `[GOVERNING_LAW_JURISDICTION]`, `[EFFECTIVE_DATE]` in
   `legal/privacy.md` and `legal/terms.md`, plus `[SUPPORT_EMAIL]` in
   `data-and-security.md` and `faq.md`.
2. **Deploy the wiki to `docs.locatour.com.au`** so the policy URLs resolve
   publicly (Cloudflare Pages — deferred until now).
3. **In-app account deletion — DONE (verified 2026-06-29).** Implemented end to
   end: Profile tab → **Delete account** (`src/app/(tabs)/profile.tsx`) →
   `deleteAccount()` (`src/utils/account.ts`) calls `DELETE /api/account` →
   `AccountController::destroy` deletes tokens + check-ins (photo-removal hook
   fires per row, clearing R2) + the user, with DB `cascadeOnDelete` removing
   unlocked-locations and account-flags; the app then signs out of Google and
   wipes local data. Public web deletion URL added at
   `docs.locatour.com.au/legal/data-deletion/` for the Play Data Safety form.
4. **Background-location demo video** for the Play declaration (§4).
5. **Sign in with Apple — watch this.** Verified 2026-06: `src/app/auth/login.tsx`
   ships **mock** social login with **Google + Apple** buttons (no real OAuth).
   Two implications: (a) don't ship mock auth to production; (b) when you wire
   **real Google** sign-in, Apple **requires** a real **Sign in with Apple**
   option too (the button already exists, so honour it for real).
6. **UGC moderation/report path** for user photos (§7).
7. **Export compliance (Apple):** verified `ITSAppUsesNonExemptEncryption` is
   **not set** in `app.json`. App uses only standard HTTPS → add
   `ios.infoPlist.ITSAppUsesNonExemptEncryption = false` to skip the per-build
   prompt. (Confirm no custom crypto first — none expected.)
8. **Production API over HTTPS.** Memory notes a cleartext-HTTP dev gotcha —
   production must be TLS for the Data Safety "encrypted in transit" claim and
   for ATS (Apple).

---

## 10. Cross-references

- Public legal: `wiki/src/content/docs/legal/{privacy,terms}.md`
- Trust summary: `wiki/src/content/docs/trust/data-and-security.md`
- Background location feature + Play checklist: `07-nearby-alerts-and-background-location.md`
- Permission strings: `app.json`
- Check-in verification (foreground): `03-checkin-verification-spec.md`
