# Check-in Verification Spec — Anti-Cheat (Geofencing + Photo Metadata)

**Status:** Design / specification — not yet implemented.
**Scope:** How Locatour verifies that a check-in photo was actually taken **at** the claimed location and **recently**, and how it resists cheating.
**Audience:** App engineers (Expo / React Native), Laravel backend engineers, product.
**Verified against:** Expo SDK 55 (`expo-camera@~55.0.19`, `expo-location@~55.1.10`, `expo@~55.0.26`), official docs at <https://docs.expo.dev/versions/v55.0.0/>, and the installed type definitions in `node_modules`.

---

## 0. Executive summary

- **Live device GPS at capture time is the only reliable client signal.** Everything else (photo EXIF, file timestamps, in-app-only capture) is corroborating evidence that a determined attacker can defeat. The check is a Haversine distance from the live fix to the location's geofence centre, compared against a per-location `geofence_radius_m` (default **50m**), widened by the GPS accuracy radius.
- **`expo-camera` does NOT auto-populate GPS EXIF.** Confirmed against SDK 55 docs and the installed types: `takePictureAsync({ exif: true })` returns device EXIF (orientation, camera settings, a timestamp) but **no GPS tags** unless you inject them yourself via `additionalExif`. So EXIF GPS is *self-reported by our own app* — it proves nothing on its own and is trivially strippable/spoofable. Treat EXIF as a weak corroborating signal only.
- **Mock-location detection is Android-only.** `LocationObject.mocked` exists on Android (verified in `Location.types.d.ts:247-250`); there is **no iOS equivalent** in Expo. iOS mock GPS requires a jailbreak or a wired dev tool, so this is acceptable, but it means client mock-detection is partial.
- **The client can always be tampered with, so the server must re-validate.** The Laravel backend must independently re-check GPS-in-geofence, timestamp freshness, and per-user/per-location dedupe, and must be the eventual sole authority that awards XP. The current app awards XP locally in `storage.addCheckIn()` — that is fine for the offline MVP but is **not** an anti-cheat boundary.
- **First concrete change:** in `src/app/(tabs)/camera.tsx`, set `DEV_IGNORE_RADIUS = false` and stop the "nearest location regardless of distance" fallback so the 50m geofence is actually enforced (Phase 1). Full trust only arrives with server-side re-validation (Phase 2+).

---

## 1. Threat model

We are defending the integrity of the **rewards economy**: XP, levels, streaks, achievements, and (per the product vision) a future wallet. If check-ins are cheap to fake, the leaderboard and any redeemable rewards are worthless. We assume a motivated user who wants points without physically visiting locations.

| # | Attack | How it works | Client-defeatable? | Primary defence |
|---|--------|--------------|--------------------|-----------------|
| T1 | **Fake GPS / mock-location app** | Android "mock location" developer setting or apps like Fake GPS Location feed false coordinates to *all* apps, including ours. | **No** — the OS lies to us. | Android `mocked` flag + server-side anomaly detection (Phase 3/4). |
| T2 | **Upload an old / saved photo** | User picks a photo from the gallery taken earlier or elsewhere, instead of shooting live. | **Partially** — refuse the gallery and only allow in-app capture, but a rooted device can still feed a fake camera frame. | In-app-only capture (no `expo-image-picker`) + freshness window (Phase 1). |
| T3 | **Right place, wrong day** | User physically visited once, took a photo, and re-submits it later (or repeatedly) for more points. | **Partially** — timestamp freshness + server dedupe. | Capture-freshness window + server dedupe (Phase 1 client / Phase 2 server). |
| T4 | **Shared / re-used photo between users** | Friends pass one valid photo around; multiple accounts check in with the same image. | **No** client-side — needs server image identity. | Server dedupe on (perceptual hash + location + time) and per-user uniqueness (Phase 3). |
| T5 | **Emulator / rooted / jailbroken device** | Run the app in an emulator with arbitrary GPS, or a rooted device that patches our checks. | **No** — our own checks run in a hostile process. | Server re-validation (mandatory) + device attestation (Phase 4). |
| T6 | **Spoofed EXIF GPS** | If we ever *trust* photo EXIF GPS, the attacker writes whatever GPS tags they like into the file. | **No** — EXIF is user-controlled bytes. | Never trust EXIF as proof; only ever cross-check it against the live fix (Phase 3). |
| T7 | **Replay / forged API request** | Attacker skips the app entirely and POSTs a fabricated check-in (good coords, fresh timestamp) straight to the API. | **No** client check helps. | Server-issued nonces, auth, rate limits, attestation (Phase 4). |

**Honest statement of limits.** No client-side check is proof. Anything the app computes runs on a device the attacker controls; they can patch the binary, hook the functions, or feed fake sensor data. Client checks exist to (a) give honest users instant, friendly feedback and (b) raise the effort bar for casual cheats. **Trust is only established server-side** (T5, T7), and even the server cannot *prove* physical presence from a GPS coordinate — it can only make cheating expensive and detectable.

---

## 2. Verification signals, ranked by reliability

### Signal A — Live device GPS at capture time (PRIMARY, reliable)

This is the signal we anchor on. At the moment of capture we already call `expo-location`. We compute the Haversine distance from the live fix to the location centre and require it to be within the geofence.

**Already in `camera.tsx`:** `getDistance()` (Haversine, line ~148) and the `Location.getCurrentPositionAsync` call inside `runVerification()` (line ~202).

**Accuracy handling.** `getCurrentPositionAsync` returns `coords.accuracy` = the radius of uncertainty in metres (verified in docs and `Location.types.d.ts:271`). A fix is not a point; it is a circle of radius `accuracy`. Rules:

- Request a high-accuracy fix for check-in: `accuracy: Location.Accuracy.High` (the current code uses `Balanced`, which is too coarse for a 50m fence — **change this**).
- **Effective pass test:** `distance - coords.accuracy <= geofence_radius_m`. I.e. the user passes if the *nearest edge of their uncertainty circle* could plausibly be inside the fence. This is generous on purpose; we tighten with the borderline band (§5).
- **Poor accuracy guard:** if `coords.accuracy` is `null` or larger than `MAX_ACCURACY_M` (default **35m**), the fix is too vague to trust either way. Do not hard-fail; prompt the user to wait/move to open sky and retry (§6). A huge accuracy radius would otherwise let someone "pass" from far away.
- **Staleness:** treat the fix as fresh only if obtained within the last few seconds of capture (we fetch it inline, so this holds; reject any cached fix older than ~10s).

**Mock-location detection (Android only).** `LocationObject.mocked` is `true` when the OS reports the coordinate came from a mock provider (verified `Location.types.d.ts:247-250`, `@platform android`). On Android, `mocked === true` should **fail or flag** the check-in (see matrix). There is **no iOS equivalent** — Expo exposes nothing, and iOS GPS spoofing requires a jailbreak/wired tool, so iOS relies on server anomaly detection instead. Also call `Location.hasServicesEnabledAsync()` before fetching, to distinguish "services off" from "permission denied" for clearer UX.

> Reliability verdict: **High for honest users, medium against attackers.** Defeatable by T1/T5 on a determined device, but it is the best signal we have and the one the server re-checks.

### Signal B — Photo EXIF GPS + timestamp (CORROBORATING, weak — read this carefully)

**Critical, verified fact:** `expo-camera`'s `takePictureAsync({ exif: true })` does **NOT** automatically embed the device's GPS into the photo's EXIF. Confirmed two ways:

1. SDK 55 docs (camera page) — GPS coordinates are *not* automatically populated; you must add them yourself via `additionalExif`.
2. Installed types (`Camera.types.d.ts:96, 109-117`): `exif?: boolean` returns "various fields based on the device and operating system"; `additionalExif?: Record<string, any>` is the manual escape hatch (`@platform android`, `@platform ios`).

Implications:

- For an in-app capture, the returned `exif` object generally contains camera/orientation fields and a capture **timestamp** (`DateTimeOriginal` / `{Exif}` dict), but **GPS tags are typically absent**. Do not build any logic that *requires* `GPSLatitude`/`GPSLongitude` to be present from a native in-app shot.
- Any GPS that *does* appear in EXIF is either (a) injected by us via `additionalExif` (so it is just a copy of Signal A — not independent corroboration) or (b) present in a user-supplied file, in which case it is attacker-controlled bytes.
- EXIF is **trivially stripped or rewritten** with off-the-shelf tools. So EXIF can never be *proof* of anything.

How we still use it (Phase 3): if EXIF GPS happens to be present, cross-check it against the live fix (Signal A) and the geofence. A *match* adds a little confidence; a *mismatch* is a **flag for review**, not an outright pass/fail (an honest user might have a phone that writes stale or coarse GPS). Fields to read when present:

- `GPSLatitude` / `GPSLatitudeRef`, `GPSLongitude` / `GPSLongitudeRef` → decimal degrees, compared via Haversine to the live fix and the fence.
- `DateTimeOriginal` (or the `{Exif}` `DateTimeOriginal`) → compared to server time for freshness (§ Signal C). Note EXIF datetimes are usually **local time with no zone**, so compare loosely.

> Reliability verdict: **Low.** Self-reported and spoofable. Corroboration and flagging only — never a gate that grants points.

### Signal C — Capture freshness (CORROBORATING)

Goal: the photo must be shot *now, in the app*, not pulled from the camera roll or re-submitted later.

- **In-app-only capture.** Do not add `expo-image-picker` / gallery selection to the check-in flow. The only path to a `photoUri` is the live `CameraView.takePictureAsync()` (currently `handleShutter`, line ~174). This defeats casual T2. (A rooted device feeding a fake camera frame still beats it — that is the server's problem.)
- **Tight timestamp window.** Capture a `capturedAt` client timestamp at shutter and compare against **server time** (never trust the device clock alone — see Phase 2). The window should be small (e.g. capture → submit within `FRESHNESS_WINDOW_S`, default **120s**). The offline queue (§6) is the documented exception: queued check-ins keep their original `capturedAt` and are re-validated against it on sync.
- The web/simulator path produces no real photo (`photoUri = null`); those are demo-only and must be marked unverifiable, never trusted for real rewards.

> Reliability verdict: **Medium** for the no-gallery rule, **low** for device timestamps until anchored to server time.

### Ranking summary

1. **Live GPS in geofence (Signal A)** — gate. Server re-validates.
2. **In-app-only capture (Signal C, no gallery)** — gate (client UX) / re-checked server-side via timing.
3. **Freshness window vs server time (Signal C)** — gate, server-authoritative.
4. **Android `mocked` flag (Signal A)** — fail/flag.
5. **EXIF GPS/timestamp (Signal B)** — corroborate / flag only. Never a gate.

---

## 3. Client-side checks vs server-side validation

**Why both.** The client gives instant friendly feedback and blocks casual cheats; but the client process is fully controlled by the attacker (T5/T7), so **nothing the client asserts can be trusted for awarding rewards**. The server must independently recompute the verdict from the raw submitted data and is the eventual sole authority for XP.

### Client enforces (in `camera.tsx`)
- Real geofence distance check with accuracy handling (Signal A) — replaces `DEV_IGNORE_RADIUS`.
- High-accuracy location request + poor-accuracy guard.
- Android `mocked` check.
- In-app-only capture; capture `capturedAt`; freshness window.
- Friendly failure UX (§6).
- Offline queueing when no network, with verify-on-sync.

### Server (Laravel) re-validates — mandatory before awarding points
- Recompute Haversine(`submitted_coords`, `location.coordinates`) and compare to `location.geofence_radius_m` widened by `submitted_accuracy`. **Reject if out of fence** regardless of what the client said.
- Compare `captured_at` / `submitted_at` to **server time**; reject stale or future-dated submissions outside the window.
- **Dedupe:** reject a second check-in by the same user at the same location inside a cooldown (e.g. one award per user per location per `COOLDOWN_H`, default **6h**), and detect impossible travel (two check-ins far apart in too little time).
- Honour the client `mocked` flag (fail/flag) and run its own anomaly scoring (Phase 3/4).
- **Award XP/level/streak/achievements server-side** — migrate the logic currently in `storage.addCheckIn()` (`src/utils/storage.ts:278-329`) to the backend so the client number is display-only.
- Maintain a **review queue** for flagged-but-not-rejected check-ins (EXIF mismatch, borderline accuracy, mock-on-iOS-suspected).

This ties directly to the planned Laravel backend (see `docs/locatour/` backend plan): the check-in `POST` endpoint is the trust boundary.

---

## 4. Geofence data model

Each location owns its geofence. The Laravel backend stores it; the app reads it per location.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `coordinates.latitude` / `longitude` | float | — | Fence centre (already on `ExploreLocation`, `src/types/index.ts:31-42`). |
| `geofence_radius_m` | int (metres) | **50** | Per-location, admin-configurable in Filament. Small for a café entrance, large for a sprawling park or lookout. |
| `max_accuracy_m` | int (metres) | **35** | Optional per-location override of the global poor-accuracy threshold. |
| `freshness_window_s` | int (seconds) | **120** | Optional per-location override. |
| `cooldown_h` | int (hours) | **6** | Per-location re-check-in cooldown for dedupe. |

**New field to add to `ExploreLocation`:** `geofenceRadiusM: number` (default 50). The current code hard-codes `CHECK_IN_RADIUS_M = 50` in `camera.tsx`; this must become **per-location**, sourced from the API. The seed data in `src/utils/storage.ts` (INITIAL_LOCATIONS) should gain the field too.

**Radius vs GPS accuracy.** Effective allowed distance = `geofence_radius_m + min(coords.accuracy, ACCURACY_CAP)`, where `ACCURACY_CAP` (default **35m**) stops a deliberately huge accuracy radius from inflating the fence. If `coords.accuracy > max_accuracy_m`, do not decide — ask the user to retry (§6). The server applies the same formula with its own caps so a client can't widen its own fence.

---

## 5. Decision logic (pass / borderline / fail)

Computed client-side for UX, then re-computed server-side authoritatively. Let:

- `d` = Haversine(liveFix, location.coordinates)
- `r` = `location.geofence_radius_m`
- `acc` = `coords.accuracy` (capped at `ACCURACY_CAP`)
- `fresh` = `(now - capturedAt) <= freshness_window_s`
- `inApp` = photo came from live `takePictureAsync` (not gallery)
- `mocked` = `LocationObject.mocked === true` (Android)

| Condition | Verdict | Action |
|-----------|---------|--------|
| `acc` null or `> max_accuracy_m` | **Borderline (no decision)** | Ask user to retry with better signal; do not award. |
| `mocked === true` | **Fail (or flag)** | Block client-side; server flags account for review. |
| `!inApp` (gallery/imported) | **Fail** | Refuse — capture in-app. |
| `!fresh` (outside window) | **Fail** | Refuse — retake; offline-queued items keep original time and are checked on sync. |
| `d + acc <= r` and `fresh` and `inApp` and `!mocked` | **Pass** | Award (server-side eventually). EXIF, if present and matching, raises confidence. |
| `r < d + acc <= r + BORDERLINE_M` (default 25m), `fresh`, `inApp`, `!mocked` | **Borderline** | Soft prompt "Move a little closer"; allow one retry. Server may accept-but-flag. |
| `d - acc > r` (clearly outside even allowing for uncertainty) | **Fail** | "You're not close enough." |
| Pass on GPS **but** EXIF GPS present and far from live fix | **Flag for review** | Award provisionally (or hold), enqueue for review. Do not hard-fail on EXIF alone. |

Recommended client constants (replacing the current flags in `camera.tsx`):

```
CHECK_IN_RADIUS_M      -> per-location geofenceRadiusM (default 50)
MAX_ACCURACY_M         = 35
ACCURACY_CAP           = 35
BORDERLINE_M           = 25
FRESHNESS_WINDOW_S     = 120
DEV_IGNORE_RADIUS      = false   // and behind __DEV__ only; never ships true
```

---

## 6. Failure & edge-case UX

Keep messaging friendly but firm; never reveal exact thresholds (don't teach cheaters the boundary).

| Situation | Message (tone: encouraging) | Allow retry? |
|-----------|------------------------------|--------------|
| **Out of range** (`d - acc > r`) | "Hmm, you're not at *{name}* yet. Get a bit closer and try again!" | Yes |
| **Borderline** (just outside) | "Almost there — move a few steps closer to check in." | Yes |
| **Poor GPS accuracy** | "We can't pin down your location. Step into the open and tap retry." Show a spinner / "improving signal…". | Yes (auto-retry a couple of times) |
| **Location services off** (`hasServicesEnabledAsync` false) | "Turn on Location to check in." Deep-link to settings. | After enabling |
| **Permission denied** | "Locatour needs location to verify check-ins." Offer settings deep-link; if `!canAskAgain`, explain it's in Settings. | After granting |
| **Mock location detected** (Android) | "We couldn't verify your location. Please disable mock location and try again." (Firm, no specifics.) | After disabling; repeated → server flag |
| **Camera permission denied** | Existing copy in `camera.tsx` fallback is fine. | After granting |
| **Offline** | "You're offline — we've saved this check-in and we'll verify it when you're back online." Queue it (§ offline). | Auto on sync |
| **No real photo (web/sim)** | Demo only — mark unverifiable; never grant real rewards. | n/a |

**Offline flow.** When `NetInfo` reports offline, queue the check-in with its `capturedAt`, coords, and accuracy via `storage.queueOfflineCheckIn()` (already exists, `src/utils/storage.ts:391`). On reconnect, replay the queue to the server, which re-validates **against the original `capturedAt`** (not the sync time) and the geofence. Points are provisional until the server confirms. Note: the current `CheckIn`/queue schema stores coords + timestamp but **not** `accuracy` or a `mocked` flag — these fields must be added to the queue + `CheckIn` type for honest offline re-validation.

---

## 7. Phased implementation plan

**Phase 1 — Enforce the geofence on the client (MVP anti-cheat).**
- `camera.tsx`: set `DEV_IGNORE_RADIUS = false` and gate it behind `__DEV__` so it can never ship `true`; remove the "nearest location regardless of distance" fallback (lines ~234-240).
- Switch the location request to `Location.Accuracy.High`; read `coords.accuracy`; apply the poor-accuracy guard and the `d ± acc` test (§5).
- Add `geofenceRadiusM` to `ExploreLocation` (`src/types/index.ts`) and seed data; use it instead of the constant `CHECK_IN_RADIUS_M`.
- Enforce in-app-only capture (no gallery); record `capturedAt` and apply the freshness window.
- Friendly failure UX (§6). Outcome: honest users gated to ~50m; casual cheats (old gallery photos, couch check-ins with real GPS) blocked. Still trusts the device — not yet cheat-proof.

**Phase 2 — Server-side re-validation (the real trust boundary).**
- Laravel `POST /api/checkins` accepting `{ location_id, coords, accuracy, captured_at, photo }`.
- Server recomputes geofence + freshness **against server time**, dedupes (cooldown + impossible-travel), and **awards XP/streak/achievements** — porting the logic from `storage.addCheckIn()` (`src/utils/storage.ts:278-329`). Client XP becomes display-only.
- Client posts on capture (and on offline-queue sync). Outcome: tampering the app no longer grants real points; the server is authoritative.

**Phase 3 — Corroboration & review queue.**
- Read EXIF via `takePictureAsync({ exif: true })`; cross-check any present EXIF GPS/timestamp against the live fix; **flag mismatches** for review (never hard-fail on EXIF).
- Wire Android `mocked` → fail/flag end-to-end; add server anomaly scoring (impossible travel, velocity, repeated borderline).
- Server-side image dedupe via perceptual hash to catch shared/re-used photos (T4) and a Filament review queue for flagged check-ins. Outcome: catches mock GPS (Android), shared photos, and suspicious patterns.

**Phase 4 — Hardened anti-abuse.**
- Per-user/IP/device **rate limits** on the check-in endpoint.
- **Server-issued nonces** per check-in attempt to stop replay/forged requests (T7).
- **Device attestation** (Play Integrity / App Attest) to reduce emulator/rooted abuse (T5).
- Trust scoring + manual review escalation; optional honeypot locations. Outcome: meaningfully raises the cost of automated, large-scale cheating.

---

## 8. Concrete pointers — exact functions/flags to change

All in `src/app/(tabs)/camera.tsx` unless noted:

- **`DEV_IGNORE_RADIUS` (line ~31)** — set to `false`; gate behind `__DEV__`. This single flag currently bypasses the entire geofence.
- **`CHECK_IN_RADIUS_M` (line ~28)** — replace the constant with per-location `geofenceRadiusM` read from the location.
- **`runVerification()` (lines ~188-290)** — the core. Specifically:
  - Location request (line ~202): change `Accuracy.Balanced` → `Accuracy.High`; capture full `pos.coords` including `accuracy`; read `pos.mocked` and call `Location.hasServicesEnabledAsync()`.
  - Target selection + radius test (lines ~223-246): drop the "nearest regardless" fallback; implement the `d ± acc` decision matrix (§5) against the chosen location's own `geofenceRadiusM`; branch to borderline/poor-accuracy/mock states.
  - Capture `capturedAt` at shutter (`handleShutter`, line ~174) and apply the freshness window here.
- **`handleShutter()` (lines ~161-182)** — keep in-app-only; do **not** add a gallery picker. Pass `{ exif: true }` to `takePictureAsync` in Phase 3.
- **`FlowState` (line ~40)** — add states for `borderline` / `poor-accuracy` / `mock-detected` (or reuse `error` with distinct `errorMessage`s) for the §6 UX.
- **`CheckIn` type (`src/types/index.ts:44-54`)** — add `accuracyM?`, `capturedAt`, `mocked?`, and a server `verificationStatus` (`pending | verified | flagged | rejected`).
- **`ExploreLocation` type (`src/types/index.ts:31-42`)** — add `geofenceRadiusM: number`.
- **`storage.addCheckIn()` / `queueOfflineCheckIn()` (`src/utils/storage.ts:278, 391`)** — Phase 2: stop awarding XP locally (server authoritative); extend the offline queue schema to persist `accuracy` + `capturedAt` + `mocked` for honest verify-on-sync.

---

## 9. Key risks / honest caveats

- **iOS has no mock-location flag.** iOS relies entirely on server anomaly detection; a jailbroken iOS device can spoof GPS undetected by the client.
- **EXIF GPS is not a presence proof and is usually absent for in-app shots** — do not design any gate around it.
- **GPS itself proves a coordinate, not a body.** Even a perfect, un-mocked fix can be faked at the OS level on a compromised device; physical-presence certainty is unattainable client-side.
- **Until Phase 2 ships, all "verification" is cosmetic** — XP is awarded locally and the geofence runs in an attacker-controlled process. Communicate this clearly to product: Phase 1 deters honest-user mistakes and casual cheating, not determined abuse.
