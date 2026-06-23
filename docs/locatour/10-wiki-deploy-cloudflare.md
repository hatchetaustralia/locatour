# Deploying the Wiki to docs.locatour.com (Cloudflare Pages)

**Status:** How-to for publishing the public wiki. Internal. Resolves the
"deploy the wiki" blocking gap in `08-store-submission-guide.md` §9 — the store
privacy/terms URLs must resolve publicly before submission.

The wiki is a static Astro/Starlight site in `wiki/`. Any static host works
(Netlify, Vercel, GitHub Pages); **Cloudflare Pages** is the default below.

---

## 1. What gets deployed

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root / base directory:** `wiki` (the site is in a subfolder of the monorepo)
- **Node version:** 20+ (set `NODE_VERSION=20` if the platform defaults lower)
- `site` is already set to `https://docs.locatour.com` in `wiki/astro.config.mjs`
  — this drives the sitemap and canonical URLs. Update it if the hostname changes.

## 2. Cloudflare Pages — first deploy

1. Push the `wiki` branch (or merge to `main`) to the Git remote Cloudflare can
   read.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the repo and branch. Set:
   - **Framework preset:** Astro (or None).
   - **Root directory:** `wiki`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variable:** `NODE_VERSION = 20`
4. **Save and Deploy.** You'll get a `*.pages.dev` preview URL — verify the site
   loads, search works, and `/legal/privacy/` renders.

## 3. Custom domain

1. In the Pages project → **Custom domains → Set up a custom domain** →
   `docs.locatour.com`.
2. If `locatour.com` is on Cloudflare DNS, the `CNAME` is added automatically.
   Otherwise add a `CNAME` record `docs → <project>.pages.dev` at your DNS host.
3. Wait for the certificate to issue (TLS is automatic). Confirm
   `https://docs.locatour.com/` serves the site.

## 4. Post-deploy verification

- [ ] `https://docs.locatour.com/legal/privacy/` and `/legal/terms/` load over
      HTTPS (these are the store-required URLs).
- [ ] `https://docs.locatour.com/sitemap-index.xml` resolves.
- [ ] `https://docs.locatour.com/llms.txt` resolves.
- [ ] `https://docs.locatour.com/robots.txt` resolves and points at the sitemap.
- [ ] Search box returns results (Pagefind index shipped).
- [ ] Spot-check the FAQ page source contains the `FAQPage` JSON-LD.

## 5. Ongoing

- Pages auto-builds on every push to the connected branch. Edits to `wiki/**`
  redeploy automatically; nothing else in the monorepo triggers a wiki build
  since the root directory is scoped to `wiki`.
- Preview deployments are produced for PRs/branches — handy for reviewing copy
  changes before they go live.

## 6. Before going public — content gates

Do **not** publish until:

- The **legal placeholders are filled** and reviewed (`08-…` §9.1):
  `[LEGAL_ENTITY_NAME]`, `[SUPPORT_EMAIL]`, `[GOVERNING_LAW_JURISDICTION]`,
  `[EFFECTIVE_DATE]` in `legal/privacy.md` + `legal/terms.md`, and
  `[SUPPORT_EMAIL]` in `trust/data-and-security.md` + `help/faq.md`.
- A final read-through confirms no proprietary mechanics leaked (per
  `wiki/CONTENT-GUIDE.md`).

## 7. Cross-references

- Submission overview: `08-store-submission-guide.md`
- Site config: `wiki/astro.config.mjs`, `wiki/README.md`
