# Deploying the backend to Laravel Cloud (monorepo)

This repo is a **monorepo**: the Laravel API/admin lives in **`backend/`**, while the
root holds the Expo app + the `wiki/` site. **Laravel Cloud does not officially
support monorepos** (it expects a Laravel app at the repo root), so we use the
documented workaround: <https://cloud.laravel.com/docs/knowledge-base/monorepo-support>

## 1. Repo signal (already committed)

A copy of `backend/composer.lock` is committed at the **repo root** as `composer.lock`.
That's the only thing that makes Laravel Cloud recognise the repo as a Laravel app
(without it you get *"Unsupported framework"* on import). It does **not** need to be
kept in sync with `backend/composer.lock`.

## 2. Create the application (dashboard)

- Import `hatchetaustralia/locatour`, production branch **`main`**, region **Sydney**.
- There is **no** "subdirectory / app path" field — the `backend/` promotion happens
  in the build script below.

## 3. Build command (Environment → Deployments)

**Replace the default build command** with this (and remove the default `npm install
&& npm run build` step — the root `package.json` is the Expo app and would fail):

```bash
# Promote the backend/ Laravel app to the deploy root, then install PHP deps.
cp -Rf backend/. .
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
```

After the `cp`, the deploy root *is* the Laravel app (the real `backend/composer.json`
overwrites the root shim), so `composer`/`artisan` resolve normally. Filament ships
its own compiled assets, so no `npm`/Vite build is needed.

## 4. Deploy command (runs each release, just before go-live)

```bash
php artisan migrate --force
```

## 5. First deploy — one-time (Commands tab)

```bash
php artisan db:seed --force      # locations + achievements + settings (slug fix is in)
```
`storage:link` is **not** needed in production — photos go to S3, not the local disk.

## 6. Environment variables (dashboard)

| Var | Value |
|---|---|
| `APP_KEY` | generate (`php artisan key:generate --show`) |
| `APP_URL` | the assigned Cloud HTTPS URL (drives Sanctum, Google OAuth callbacks, share links) |
| `DB_CONNECTION` | `pgsql` (attach a Cloud Postgres database; it injects `DB_*`) |
| `SESSION_DRIVER` / `CACHE_STORE` / `QUEUE_CONNECTION` | `database` |
| `PUBLIC_DISK_DRIVER` | **`s3`** — routes uploaded photos to object storage (prod is ephemeral) |
| `AWS_*` | bucket creds: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_BUCKET`, `AWS_URL` (public bucket base URL) |
| `GOOGLE_CLIENT_ID` | app sign-in token verification |
| `GOOGLE_CLIENT_SECRET` / Google redirect | Filament admin Socialite login (redirect = `APP_URL/...`) |
| `GOOGLE_MAPS_KEY` | maps |
| `SANCTUM_STATEFUL_DOMAINS` | the Cloud domain |
| mail | `RESEND_API_KEY` or `POSTMARK_API_KEY` |

Add a **queue worker** process (queue is `database`) and the **scheduler** if used.

## 7. Object storage notes

- Photos are served via `Storage::url()` (unsigned), so the **bucket must allow public
  reads** (`config/filesystems.php` sets `visibility: public` on the s3 `public` disk).
- After go-live, update the **Google OAuth redirect URI** to the real Cloud domain.

> Monorepo support is an **unsupported workaround** — re-check the KB before deploying
> in case Laravel Cloud ships a native app-path setting that supersedes this.
