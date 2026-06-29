# Publishing Runbook — Locatour (Google Play + web properties)

**Status:** Live runbook for the first public launch. Created 2026-06-29.
Consolidates the hosting/DNS/store decisions made this session. Supersedes the
Cloudflare-Pages hosting steps in `10-wiki-deploy-cloudflare.md` (we moved docs
hosting to **Vercel**; DNS still on Cloudflare).

---

## 0. Decisions locked

| Thing | Decision |
|---|---|
| Domain | **locatour.com.au** (everything repointed off the old `.com`) |
| DNS | **Cloudflare** (nameservers moving there) |
| Landing site `locatour.com.au` | New **Astro** site in `web/` → **Vercel** |
| Docs site `docs.locatour.com.au` | Existing **Astro/Starlight** wiki in `wiki/` → **Vercel** |
| Admin `portal.locatour.com.au` | Existing **Laravel Cloud** app (Filament) → custom domain |
| Android build | EAS `production` profile → **AAB**, all ABIs, autoIncrement |
| First Play track | **internal** (draft) → widen to closed/open/production later |

---

## 1. DNS (Cloudflare) — all records DNS-only (grey cloud)

Vercel and Laravel Cloud both manage their own TLS; proxying Cloudflare on top
causes cert/redirect loops. Keep every record **grey cloud**.

| Host | Type | Value | Platform |
|---|---|---|---|
| `@` (root) | A | `76.76.21.21` | Vercel (landing) |
| `www` | CNAME | `cname.vercel-dns.com` | Vercel (landing) |
| `docs` | CNAME | `cname.vercel-dns.com` | Vercel (wiki) |
| `portal` | CNAME | (target shown by Laravel Cloud → Domains) | Laravel Cloud |

**Pattern:** add the custom domain *inside each platform's dashboard first* — it
tells you the exact value, and for Vercel it confirms the record. After moving
nameservers, check Cloudflare's imported records first so nothing is dropped.
No MX needed unless you want `@locatour.com.au` email (support is
`support@hatchet.com.au`).

---

## 2. Landing site → Vercel

1. `web/` is a standalone Astro static site (built this session). Verify locally:
   `cd web && npm install && npm run build` (outputs `dist/`).
2. Vercel → **Add New Project** → import the repo → **Root Directory: `web`**.
   Framework preset: Astro. Build `npm run build`, output `dist`.
3. Add domain `locatour.com.au` (+ `www`) in the project → Vercel shows the A/CNAME
   to confirm on Cloudflare (already in §1).

## 3. Docs site → Vercel

1. Second Vercel project, same repo, **Root Directory: `wiki`**. Astro preset,
   build `npm run build`, output `dist`, `NODE_VERSION=20`.
2. Add domain `docs.locatour.com.au`.
3. Verify: `/legal/privacy/` and `/legal/terms/` load over HTTPS, search works,
   sitemap at `/sitemap-index.xml`.

> Cloudflare Pages (per doc 10) is the alternative; we chose Vercel for one
> platform across both sites. If you prefer Pages for docs, that doc still applies
> — just repoint to `.com.au`.

## 4. Admin portal → Laravel Cloud

1. Laravel Cloud → the Locatour app → **Domains** → add `portal.locatour.com.au`.
2. Add the CNAME it gives you on Cloudflare (grey cloud), wait for its cert.
3. The app already redirects `/` → `/admin` (Filament, Google sign-in gated by the
   admin allowlist). Nothing to build.
4. Confirm `APP_URL` / any absolute-URL config points at the new host where it
   matters (share links etc. — see the check-in sharing notes).

---

## 5. Google Play submission

EAS side is ready (`eas.json` production profile, AAB + all ABIs + autoIncrement;
a `submit` scaffold targets the **internal** track as **draft**).

1. **Build:** `eas build -p android --profile production`
2. **App signing:** let Google Play App Signing manage the key (default). EAS
   creates the upload key.
3. **First upload is easiest done manually** in Play Console (Internal testing →
   Create release → upload the AAB) so app signing is set up. After that you can
   automate with `eas submit -p android` once a service account is configured
   (Play Console → Setup → API access → service account with release permission;
   drop the JSON at `./google-service-account.json`, gitignored).
4. Complete the **App content** declarations — see `08-store-submission-guide.md`
   (Data Safety, content rating, target audience, ads = none).
5. **Privacy policy URL:** `https://docs.locatour.com.au/legal/privacy/`
6. Store listing: name, short/full description, icon, feature graphic, screenshots
   (start from the `emu-*` / `v4-*` captures in repo root).

### Hard blockers before submission (do NOT skip)
- ✅ **In-app account deletion** — DONE. Profile → Delete account →
  `DELETE /api/account` deletes the user, check-ins, photos (R2) and cascades
  unlocked-locations/flags, then wipes the local session. Public deletion URL:
  `https://docs.locatour.com.au/legal/data-deletion/` (use in the Data Safety form).
- 🔴 **Background-location demo video** — required for the `ACCESS_BACKGROUND_LOCATION`
  declaration; #1 rejection cause. See `09-background-location-demo-video.md`.
- ✅ **Legal entity + jurisdiction confirmed:** **Hatchet Pty Ltd** /
  **Western Australia**. Filled across the privacy, terms and data-deletion pages;
  draft banners removed. (A formal legal review of the clause wording is still
  advisable but not a store blocker.)
- 🟡 **UGC moderation/report path** for user check-in photos.

---

## 6. Quick status (2026-06-29)

Done this session: `eas.json` hardened for Play; ABI plugin env-overridable;
wiki repointed to `.com.au`; legal placeholders filled; landing page built in
`web/`; this runbook. Not done (needs you / your accounts): nameserver cutover,
Vercel + Laravel Cloud domain hookups, Play Console content + first upload,
account-deletion review, demo video.
