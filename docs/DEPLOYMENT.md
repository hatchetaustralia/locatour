# Deployment

Locatour has **three independent deploy targets**. Pushing to `main` deploys **two**
of them automatically. **The mobile app is a separate, manual step** — there is no CI
that builds or ships the app.

## At a glance

| Target | What it is | How it deploys |
|---|---|---|
| **Backend** | Laravel API + Filament admin | `git push origin main` → **Laravel Cloud** (auto) |
| **Web** | `web/` (Astro → locatour.com.au) + `wiki/` (Starlight → docs.locatour.com.au) | `git push origin main` → **Vercel** (auto) |
| **App** | Expo / React Native | **Manual EAS CLI** — `eas build` (native) / `eas update` (OTA). Not git-triggered. |

> There are no EAS workflows or GitHub Actions. **Pushing code never builds or updates the app.**

## Backend & Web — push to main

`git push origin main`; Laravel Cloud and Vercel each build from `main`. Nothing else to
do. (The Vercel CLI is unreliable here — deploy via git push only.)

## App — manual EAS

`eas` may not be on `PATH`; use `npx -y eas-cli@latest …` (uses the stored Expo session).

### OTA update — JS-only changes
Nothing native changed → ship a new JS bundle over-the-air to existing installs:

```bash
# 1) MANDATORY: confirm the env holds the runtime vars (an empty env ships a broken bundle)
eas env:list --environment <preview|production>
#    must contain EXPO_PUBLIC_API_URL and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID

# 2) Publish
eas update --channel <preview|production> --environment <preview|production> --message "…"
```

- **Channels:** `preview` = the internal testing APK · `production` = the store build.
- **`runtimeVersion` = fingerprint.** An OTA only applies to a build whose native
  fingerprint matches. If anything native changed, you **cannot** OTA — rebuild.

### Native build — native code/config changed
New native dependency, `app.json` plugin/permission, SDK/runtime bump, etc.:

```bash
eas build --profile <development|preview|production>
```

- `development` = dev-client APK · `preview` = internal APK (channel `preview`) ·
  `production` = app-bundle → Play Store (channel `production`).
- Build numbers are managed remotely (`appVersionSource: remote`, `autoIncrement`).

### Verify which bundle is live on a device
The boot splash prints a build marker: **`v{version} · {first-8-of-update-id}`**
(`src/components/animated-icon.tsx`). It reads `… · embedded` until an OTA applies.
**EAS Update applies on the _next_ launch after it downloads — open the app twice.**

## Git model

Work on `main` directly; feature branches are optional (handy as a rollback unit).
**Push `main` = backend + web deploy. The app is always a separate, manual EAS command.**
