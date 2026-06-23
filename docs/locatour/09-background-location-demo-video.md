# Background-Location Demo Video — Script & Justification (Google Play)

**Status:** Production guide for the demo video + written justification that
Google Play requires for the `ACCESS_BACKGROUND_LOCATION` declaration. Internal.

**Why this exists:** Google Play's *Sensitive app permissions → Location*
declaration **requires** (a) a short video showing the in-app disclosure and the
feature, and (b) a written justification of why the core feature needs
background location. This is the #4 blocking gap in `08-store-submission-guide.md`
§9. Apple's App Review also benefits from the same recording + notes for the
"Always" location justification.

---

## 1. What Google requires of the video

- Shows the **feature actually working** and the **in-app prominent
  disclosure** that appears **before** the runtime permission prompt.
- Clearly demonstrates that the user **grants background location knowingly**
  (the disclosure → the OS prompt → the "Allow all the time" choice).
- Hosted at a **publicly accessible URL** (unlisted YouTube / Vimeo / Drive link
  is fine). You paste the link into the Play Console declaration.
- Keep it **short (~60–90s)** and unedited enough to be believable. Screen
  recording from a real device is ideal.

## 2. Pre-flight checklist

- [ ] A **standalone/dev build** on a **physical Android device** (background
      geofencing does not work in Expo Go or an emulator — see `07-…` §5).
- [ ] A **demo account** signed in (same one you give reviewers — `08-…` §6).
- [ ] At least one **discoverable spot** seeded near a place you can physically
      stand, or a way to simulate proximity for the recording.
- [ ] Background location permission **not yet granted** (so the video can show
      the grant happening). Reset via system settings if needed.
- [ ] Screen recorder ready (Android built-in recorder, or `adb screenrecord`).
- [ ] Notifications enabled at the OS level so the alert can show.

## 3. Shot list / script (~75 seconds)

> On-screen action — *(spoken or captioned narration)*

1. **App home, logged in.** *(\"This is Locatour. Its core feature, Nearby
   alerts, notifies you when you wander near a real-world spot — even with the
   app closed.\")*
2. **Navigate to Profile → Overview.** Show the **Nearby alerts** toggle with the
   "+20% pts" badge, currently **off**. *(\"Nearby alerts are off by default.
   The user turns them on here.\")*
3. **Tap the toggle on.** The **in-app prominent disclosure** appears. **Hold on
   it for 3–4 seconds and make the text readable.** *(\"Before any system
   prompt, we show this disclosure explaining that the app collects location in
   the background to find nearby spots, that location is only matched against
   nearby spots and never shared, the points bonus, and that it's reversible.\")*
4. **Tap the accept/continue button** in the disclosure. The **Android system
   permission** flow appears; show being taken to **Settings** and selecting
   **"Allow all the time."** *(\"The user knowingly grants background location.\")*
5. **Return to the app; lock the phone / send the app to background.** *(\"Now
   the app is closed.\")*
6. **Trigger an alert** (walk into / simulate the geofence). Show the
   **notification** appearing on the lock screen — "Closing in… 🔍" or "📍 Spot
   nearby!". *(\"When the user nears a spot, a notification fires.\")*
7. **Tap the notification** → app opens to that location. *(\"Tapping it opens
   the spot so they can visit and check in.\")*
8. **(Optional) Profile → toggle off** to show reversibility. *(\"They can turn
   it off any time.\")*

## 4. Written justification (paste into the Play declaration)

> Locatour is a real-world exploration game whose core feature, "Nearby alerts,"
> notifies players when they are physically near a discoverable location so they
> can visit it. Delivering this requires detecting proximity to registered
> places while the app is in the background or closed, because the value is
> precisely in surfacing nearby places during the user's everyday movement
> rather than only when the app is open. We use the Android geofencing API
> (event-driven, batched by the OS), not continuous GPS, to minimise battery
> impact. Background location is strictly opt-in: it is off by default, the app
> never requests "Allow all the time" without the user enabling the feature, and
> a prominent in-app disclosure is shown before the system permission prompt.
> Location is matched against nearby spots to trigger notifications and is not
> used to build a location history, and is never sold or shared. The feature is
> fully reversible in-app and via system settings.

## 5. Prominent-disclosure copy (must exist in-app before the OS prompt)

The on-screen disclosure (the alert shown when enabling the toggle) should say,
in plain language, all of:

- That the app **collects location in the background** to power Nearby alerts.
- **What it's for** (notify you when you're near a spot) and the **+20% bonus**.
- That location is **only matched against nearby spots**, **not tracked or
  shared**.
- That it's **reversible** at any time.

`[VERIFY]` the shipped disclosure string covers every bullet above — Google
rejects declarations where the in-app disclosure is missing or vague. Cross-check
against the wording in `wiki/.../play/nearby-alerts.md` and
`trust/data-and-security.md` so the store, the app, and the wiki all agree.

## 6. Apple note

For iOS "Always" location, attach the same recording (or describe the flow) in
**App Review notes**, and ensure the purpose strings in `app.json` (§5 of
`08-…`) explain the user benefit. Apple looks for: clear purpose string, an
in-app explanation, and that the feature genuinely needs Always (not just
When-In-Use).

## 7. Cross-references

- Submission overview + Data Safety/App Privacy: `08-store-submission-guide.md`
- Feature mechanics + Play checklist: `07-nearby-alerts-and-background-location.md`
- Player-facing copy: `wiki/src/content/docs/play/nearby-alerts.mdx`
- Disclosure / privacy copy: `wiki/src/content/docs/trust/data-and-security.md`,
  `wiki/src/content/docs/legal/privacy.md`
