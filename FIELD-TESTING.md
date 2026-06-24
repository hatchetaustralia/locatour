# Field testing — running the backend over a public tunnel

For testing the app **out in the field** (on cellular, away from your home Wi-Fi),
the phone needs to reach the Laravel backend over the public internet, not just the
LAN. We do that with a stable **ngrok** tunnel in front of your local Herd site —
no cloud deploy, no database/storage migration. The tunnel URL is permanent, so the
APK has it baked in once and never needs rebuilding just because your network changed.

**Stable tunnel URL:** `https://reflectively-unhideous-francine.ngrok-free.dev`
(ngrok free static domain → forwards to Herd's `locatour-api.test` on port 80.)

---

## Every field-testing session (the only thing you do day-to-day)

1. **Make sure Herd is running** (it serves `locatour-api.test`). It runs as a
   background service, so this is usually already true.
2. **Start the tunnel** from the repo root:

   ```bash
   npm run tunnel
   ```

   Leave it running. You'll see `url=https://reflectively-unhideous-francine.ngrok-free.dev`.
   That's it — the phone's app already points here. Walk outside and test.

When you're done, `Ctrl-C` the tunnel. The URL is reserved to your ngrok account,
so next session `npm run tunnel` brings back the **same** URL.

> The tunnel only works while your Mac is on and `npm run tunnel` is running.
> It's a dev/testing setup, not a 24/7 host — see "When to graduate" below.

---

## When you change the app and need to update the phone

The build already produces a **standalone APK** (JS bundled in, tunnel URL baked in),
so the installed app works in the field with no Metro / no Mac connection.

```bash
npm run apk
```

This bakes `FIELD_API_URL` (the tunnel) into the bundle, builds the release APK, and
copies it to `backend/public/locatour.apk`. Then, **on the phone** (tunnel running):

> Download `https://reflectively-unhideous-francine.ngrok-free.dev/locatour.apk` and reinstall.

You can do that download from anywhere — it comes through the tunnel too.

### Fast LAN-only build (optional)

When you're at home on the same Wi-Fi as the Mac and want lower latency / don't want
to run the tunnel, build a LAN-pointed APK instead:

```bash
APK_TARGET=lan npm run apk
```

That bakes your current Wi-Fi IP (`http://<mac-ip>:8000`) instead of the tunnel —
the old behaviour. Re-download the APK from `http://<mac-ip>:8000/locatour.apk` on the
same network.

---

## How it's wired (so future-you isn't surprised)

- **`.env`** (repo root) — `FIELD_API_URL` holds the stable tunnel URL.
  `scripts/publish-apk.sh` copies it into `EXPO_PUBLIC_API_URL` at build time
  (Expo inlines `EXPO_PUBLIC_*` into the JS bundle). `APK_TARGET=lan` overrides this
  to bake the Wi-Fi IP instead.
- **`package.json`** — `npm run tunnel` starts ngrok; `npm run apk` builds + publishes.
- **`backend/.env`** — `APP_URL` is set to the tunnel URL so absolute URLs the API
  hands back (check-in photos via `Storage::url()`, share links) resolve on the phone
  in the field. Original value backed up at `backend/.env.bak.pretunnel`.
  - Trade-off: with `APP_URL` pointed at the tunnel, photo/share URLs only resolve
    while the tunnel is up. For purely-local browser work with the tunnel down, either
    keep the tunnel running or temporarily restore `backend/.env.bak.pretunnel`.
- **ngrok auth** — your authtoken is saved in
  `~/Library/Application Support/ngrok/ngrok.yml` (one-time; already done).

## Gotchas

- **Filament admin through the tunnel shows an ngrok warning page first.** ngrok's
  free tier shows a one-time interstitial to *browsers* (not the app — the app's
  native `fetch` is exempt, verified). Click through once per browser session, or just
  use the admin locally at `http://locatour-api.test`, which has no interstitial.
- **"App can't reach the backend in the field"** → is `npm run tunnel` running, and is
  Herd up? Quick check: `curl -A okhttp https://reflectively-unhideous-francine.ngrok-free.dev/api/config`
  should return JSON.
- **Stale bundle** → if the app behaves like old code after `npm run apk`, you likely
  didn't reinstall the freshly-downloaded APK on the phone.

## When to graduate to real hosting

This tunnel is great for testing but needs your Mac on. When you want an always-on
staging environment, move the backend to a real host (Laravel Cloud or a Forge VPS).
That means migrating SQLite → Postgres and the local `public` disk → S3-compatible
storage for uploaded photos. At that point just repoint `FIELD_API_URL` (and the app
rebuild) at the new domain.
