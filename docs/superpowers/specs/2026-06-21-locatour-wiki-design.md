# Locatour Wiki — Public Game Guide, Trust & Legal Site

**Date:** 2026-06-21
**Status:** Approved design, pending implementation plan
**Author:** Daniel (with Claude)

## Summary

A public, player-facing documentation site for Locatour — part game wiki
(RuneScape-wiki vibe), part brand/manifesto, part store-required legal home.
Built as a standalone static site (Astro + Starlight) deployed to
`docs.locatour.com`, separate from the mobile app and the Laravel/Filament
backend.

Its three jobs:

1. **Help** players understand how to play without exposing the app's IP.
2. **Trust** — give Apple/Google and players clear, honest Privacy, Terms,
   and data/security information.
3. **Reach** — be discoverable in search and answer engines (SEO/AEO) and lay
   the groundwork for a future AI help chatbot.

Tagline throughout: **"Creating memorable experiences."**

## Goals

- A markdown-first wiki anyone on the team can edit by changing `.md` files.
- Overview-level explanation of game mechanics — *what players achieve and
  why*, never *how the engine computes it*.
- Store-compliant Privacy Policy and Terms with stable public URLs.
- Strong SEO/AEO defaults: sitemap, per-page meta/OpenGraph, JSON-LD
  structured data (`FAQPage`, `Article`), offline search, and an `llms.txt`
  map for AI crawlers.
- Brand-themed to the app (palette, logo, tagline).

## Non-Goals

- No CMS, database, or dynamic backend. Content is static markdown.
- No exposure of proprietary mechanics (tier formulas, point thresholds,
  scrape-detection numbers, check-in verification internals).
- Not legal advice. Legal pages are review-ready drafts for the user/lawyer to
  finalize.
- The AI chatbot itself is out of scope (this site only *prepares* for it via
  `llms.txt` and clean structured content).
- Does not touch the existing private `docs/locatour/` engineering specs.

## Architecture

- **Location:** new top-level `/wiki` folder in the monorepo. Self-contained
  Astro + Starlight project with its own `package.json` and lockfile. Isolated
  from the Expo app and Laravel backend — no shared build, no shared deploy.
- **Framework:** Astro + `@astrojs/starlight`. Content-first, excellent SEO
  defaults, built-in sidebar/TOC, offline search via Pagefind.
- **Content format:** Markdown / MDX in `wiki/src/content/docs/...`. URL
  structure mirrors the folder tree.
- **Deploy:** static build (`astro build`) published to **Cloudflare Pages** on
  the **`docs.locatour.com`** subdomain. Independent of the Laravel host. (Any
  static host — Netlify/Vercel — works identically; Cloudflare Pages is the
  default recommendation.)
- **No impact** on the API, Filament admin, or mobile app builds.

### Why a separate static site (recorded decision)

The user initially framed this as "on the Laravel side," but chose a modern
static generator after weighing options. A static SSG gives better build/deploy
isolation, faster pages, and stronger out-of-the-box SEO than Laravel-rendered
Blade markdown, at the cost of living on a subdomain rather than inside the
Laravel app. The subdomain is acceptable because legal pages only need stable
public URLs, not same-origin integration.

## Branding

- **Site title:** Locatour — with tagline "Creating memorable experiences."
- **Palette** (extracted from the app):
  - Primary / accent red: `#d1453b`
  - Secondary pink: `#EA739C`
  - Gold / amber: `#b46c00`, `#ffcc00`
  - Warm cream backgrounds: `#FDF3DA`, `#FCF0E8`, `#FFFDFB`
  - Splash blue: `#208AEF`
- Starlight theme customized via CSS custom properties to these tokens, with
  the app logo in the header. Dark + light modes.

## Information Architecture

Sidebar / content tree (URL = path):

```
Start Here
  • What is Locatour?              /start/what-is-locatour
  • Creating Memorable Experiences /start/memorable-experiences
How to Play
  • Getting started                /play/getting-started
  • Finding & unlocking locations  /play/locations
  • Hidden locations               /play/hidden-locations
  • Photo check-ins                /play/photo-checkins
  • Levels, tiers & progression    /play/progression
  • Rewards & your wallet          /play/rewards
  • Becoming a contributor         /play/contributors
Tech & Trust
  • Why we built it this way       /trust/why
  • How photo check-in works       /trust/photo-checkin-tech
  • Your data & security           /trust/data-and-security
Help
  • FAQ                            /help/faq
Legal
  • Privacy Policy                 /legal/privacy
  • Terms & Conditions             /legal/terms
```

## Content Guardrail (IP protection)

A `wiki/CONTENT-GUIDE.md` records the rule and is honored in all drafting:

- **Overview level only.** Describe outcomes and intent, not mechanics.
- **Never publish:** tier/level formulas, point thresholds, carrying-capacity
  numbers, scrape-detection thresholds, check-in verification internals, or any
  value lifted from the engine.
- **Do publish:** what a player can achieve, why a feature exists, how it feels
  to play, and honest data/privacy practices.

Phrasing pattern: "Higher tiers unlock the ability to protect and carry more"
— **yes**. "You reach tier 6 at N points" — **no**.

## SEO / AEO Layer

- `@astrojs/sitemap` for sitemap.xml.
- Per-page meta + OpenGraph/Twitter cards via Starlight frontmatter and a
  shared head config.
- **JSON-LD structured data:**
  - `FAQPage` on `/help/faq` (the highest-value AEO surface).
  - `Article` on guide pages.
  - `Organization` on the home/site level.
- **Offline search:** Pagefind (Starlight built-in).
- **`llms.txt`** at site root: a clean, link-rich map of the wiki for AI
  crawlers and the future help chatbot.
- Stable, human-readable URLs for store listings.

## Legal Pages

Review-ready **drafts** (not legal advice), structured for App Store / Play
Store compliance:

- **Privacy Policy** — data collected (account, location, camera/photos),
  purpose of each, location & camera permission rationale, retention, deletion
  /account-removal path, third parties, children's policy, contact.
- **Terms & Conditions** — eligibility, acceptable use, user content (photos),
  contributor responsibilities, IP ownership, disclaimers, liability,
  termination, governing law, contact.

Placeholders to fill before publishing:

- `[LEGAL_ENTITY_NAME]`
- `[SUPPORT_EMAIL]`
- `[GOVERNING_LAW_JURISDICTION]`

## Scope of First Build

**Build now:**

- Scaffold Astro + Starlight project in `/wiki` with brand theme + AEO layer
  (sitemap, meta, JSON-LD components, `llms.txt`, Pagefind search).
- `CONTENT-GUIDE.md` guardrail doc.
- **Full real content** for:
  - What is Locatour?
  - Creating Memorable Experiences
  - Getting started
  - Finding & unlocking locations
  - Photo check-ins
  - Your data & security
  - FAQ (with FAQPage schema)
  - Privacy Policy (draft)
  - Terms & Conditions (draft)
- **High-quality stubs** (real headings + intro, "more coming") for: Hidden
  locations, Progression, Rewards & wallet, Contributors, Why we built it this
  way, How photo check-in works.

**Deferred:**

- Cloudflare Pages deploy wiring + DNS for `docs.locatour.com` (build is
  previewable locally meanwhile).
- Filling stub pages.
- The AI help chatbot.

## Success Criteria

- `npm run build` in `/wiki` produces a static site with no errors.
- Local preview renders all IA pages, themed to Locatour's palette + tagline.
- Sitemap, per-page meta, FAQ JSON-LD, and `llms.txt` are present and valid.
- No proprietary mechanic numbers appear in any published page.
- Privacy + Terms drafts cover the store-required sections with clearly marked
  placeholders.

## Open Items

- `[LEGAL_ENTITY_NAME]`, `[SUPPORT_EMAIL]`, `[GOVERNING_LAW_JURISDICTION]` from
  the user before legal pages go live.
- Confirm final logo asset for the header.
- Confirm `docs.locatour.com` is the intended hostname when we wire deploy.
