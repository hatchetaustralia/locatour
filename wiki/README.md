# Locatour Wiki

The public game guide, brand home, and legal home for **Locatour** — built with
[Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

Deployed as a static site to **docs.locatour.com** (separate from the Laravel
API and the Expo app).

## Develop

```bash
cd wiki
npm install
npm run dev      # local preview at http://localhost:4321
```

## Build

```bash
npm run build    # static output in ./dist
npm run preview  # preview the production build
```

## Writing content

- Pages are Markdown in `src/content/docs/**`; the file path is the URL.
- Sidebar order lives in `astro.config.mjs`.
- **Read `CONTENT-GUIDE.md` before writing** — this site is public and must not
  expose proprietary game mechanics.

## Deploy (deferred)

Target: Cloudflare Pages on `docs.locatour.com`. Build command `npm run build`,
output directory `dist`. DNS + project wiring to be done when publishing.
