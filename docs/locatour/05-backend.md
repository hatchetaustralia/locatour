# 05 — Backend (Laravel + Filament): Locations admin & API

A Laravel backend that lets the product owner **manage locations** through a
Filament admin panel and exposes a **JSON API** the Expo app can consume as a
drop-in replacement for its mock data layer.

- **Location on disk:** `backend/` (inside the repo)
- **Framework:** Laravel 13.16, Filament 5.6, PHP 8.5
- **RBAC:** spatie/laravel-permission 7.4 + bezhanSalleh/filament-shield 4.2
  (roles: admin / moderator / contributor — see [Roles & approval workflow](#roles--approval-workflow))
- **Database:** SQLite (`backend/database/database.sqlite`) — no external DB needed
- **Scope:** the backend is fully self-contained under `backend/`. The Expo app
  still runs on its mock (`src/utils/storage.ts`) — wiring it to this API is the
  documented next step, not yet done.

---

## How to run

### Option A — Laravel Herd (already linked)

The site is linked in Herd and reachable at:

- **API:**   `http://locatour-api.test/api/locations`
- **Admin:** `http://locatour-api.test/admin`

No command needed — Herd serves it automatically. (If it ever 404s, run
`cd backend && herd link locatour-api` again.)

### Option B — Artisan dev server

```bash
cd backend
php artisan serve            # http://127.0.0.1:8000
```

- **API:**   `http://127.0.0.1:8000/api/locations`
- **Admin:** `http://127.0.0.1:8000/admin`

### First-time / reset setup

```bash
cd backend
php artisan migrate:fresh --seed   # rebuild DB: roles + 5 locations + admin & contributor users
```

---

## Admin panel

URL: `http://locatour-api.test/admin` (or `http://127.0.0.1:8000/admin`)

**Seeded logins** (both password `password`):

| Email | Role | Sees |
|---|---|---|
| `admin@locatour.test` | admin | everything + user/role management |
| `contributor@locatour.test` | contributor | only their own submissions + create |

The **Locations** resource provides CRUD scoped by role (see
[Roles & approval workflow](#roles--approval-workflow)):

- **Form:** name, category (parks / scenic / food), address, description;
  a **Tier & points** section (tier 1–10 slider that auto-fills points with the
  tier default — points stays an editable override); a **Location & geofence**
  section with a **Google map picker** (Places search, draggable marker, live
  geofence circle) plus latitude/longitude and a **geofence-radius slider**
  (50–20000 m); a **Media & tags** section with a multi-image **FileUpload**
  (reorderable, stored on the public disk), a **Tags** multi-select
  (searchable, with inline tag creation), and verification tags. Staff
  (admin/moderator) additionally see the `slug` and a **Moderation** section
  (`status`, `active`, and a read-only "Submitted by"). Contributors don't see
  those — their submissions are forced to `pending` + their own id on create,
  and the slug is auto-derived from the name. See
  [Rich locations: map picker, tiers, tags & images](#rich-locations-map-picker-tiers-tags--images).
- **Overview map:** the Locations **list page** shows a Google map above the
  table plotting **every** location pin (colour-coded by status), so admins can
  manage them visually. Click a pin → jump to that location's editor.
- **Table:** name, category, **status** (colour badge), submitted-by, **tier**
  (badge), points, radius, inline `active` toggle. A **status** filter and
  per-row **Approve** / **Reject** actions (staff-only, shown on pending rows).

The seeded users come from `DatabaseSeeder`. To add more / change roles:

```bash
php artisan make:filament-user                       # create a panel user (interactive)
php artisan permission:assign-role moderator <user>  # by id/email — promote to moderator
```

> **Prototype security note:** `User::canAccessPanel()` returns `true` for every
> authenticated user, so anyone who self-registers can log into the panel — but
> as a **contributor**, which Shield/policy locks down to submitting locations
> for moderation. Before production, consider gating panel access by role and
> tightening self-registration. See `app/Models/User.php`.

---

## Roles & approval workflow

RBAC is provided by **spatie/laravel-permission** + **filament-shield**. Three
roles are seeded by `RoleSeeder`:

| Role | Locations | Moderation | Users / roles |
|---|---|---|---|
| **admin** | full CRUD on any | approve / reject | yes (super admin — bypasses all checks) |
| **moderator** | full CRUD on any | approve / reject | no |
| **contributor** | create; view/edit **own pending** only; no delete | no | no |

How it's enforced:

- **`app/Models/Location.php`** — adds `status` (`pending`/`approved`/`rejected`)
  and `submitted_by` (FK → users). `scopeApproved()` powers the public API.
- **`app/Policies/LocationPolicy.php`** — moderators act on anything;
  contributors are limited to their own records while `status = pending`; only
  moderators can `approve`. Admin is Shield's super admin and short-circuits
  every policy via a `Gate::before` hook (`config/filament-shield.php`
  → `super_admin.name = admin`, `define_via_gate = true`).
- **`LocationResource::getEloquentQuery()`** — scopes the panel table so
  contributors only ever see their own submissions.
- **`CreateLocation::mutateFormDataBeforeCreate()`** — forces
  `status = pending`, `submitted_by = auth id`, and an auto-derived slug for
  contributors. Staff keep their entered values.
- **Approve / Reject** — per-row table actions (`LocationsTable`) authorized via
  the policy's `approve` ability; visible only on pending rows.

### Contributor sign-up → submission → approval

1. A new user visits **`/admin/register`** and signs up. `App\Filament\Pages\Auth\Register`
   assigns the **contributor** role automatically.
2. They open **Locations → New**, fill in the details, and save. The record is
   created as `pending`, owned by them. They see it in their (own-only) list but
   cannot edit others' or approve their own.
3. An **admin** or **moderator** sees the pending record (status badge =
   *Pending*, with a status filter), reviews it, and clicks **Approve** (or
   **Reject**).
4. Once **approved**, the location immediately appears in `GET /api/locations`
   and therefore in the mobile app. Rejected/pending ones never do.

To try it: log in as `contributor@locatour.test` (create a location → it's
pending, API still returns only the 5 seeds), then log in as
`admin@locatour.test` and approve it (API now returns 6).

---

## Rich locations: map picker, tiers, tags & images

Implements `docs/locatour/06-rich-locations-and-leveling-spec.md` (backend
half). All of this lives under `backend/`.

### Google Maps — env requirement & JS-API caveat

The admin map picker and the overview map use the **Google Maps JavaScript
API**. The key is read from `config('services.google_maps_key')`, backed by:

```dotenv
# backend/.env
GOOGLE_MAPS_KEY=AIza…        # reuses the app's Maps key
```

> **You must enable "Maps JavaScript API"** on this key in Google Cloud. It is a
> **separate toggle** from the *Maps SDK for Android* the Expo app uses — the
> same key can power both, but each API must be enabled individually. Until the
> JS API is enabled the admin maps render **blank** (or show a Google "for
> development purposes only" / `ApiNotActivatedMapError` overlay). **That is
> expected and is not a code bug** — the rest of the form still works, and you
> can set latitude/longitude/radius manually. If `GOOGLE_MAPS_KEY` is empty the
> maps degrade gracefully to a "Map disabled" notice.

### Map approach — custom field (not a plugin)

`cheesegrits/filament-google-maps` targets **Filament v3** and has no v5
release, so we did **not** require it. Instead the picker and overview map are
**thin custom components** (Blade + Alpine + the Google Maps JavaScript API
bootstrap loader):

- **`app/Filament/Forms/Components/LocationMapPicker.php`** + its Blade view
  `resources/views/filament/forms/components/location-map-picker.blade.php`.
  A `Field` subclass that owns no state of its own — it reads/writes the sibling
  `latitude`, `longitude`, `address` and `geofence_radius_m` form fields by
  their state paths. Provides: a **Places autocomplete** ("Kings Park" → fills
  lat/lng/address), a **draggable marker** (drag or click the map → updates
  lat/lng + reverse-geocodes the address), and a **geofence circle** bound to
  the radius slider that **resizes live** as you drag.
- **`app/Filament/Resources/Locations/Widgets/LocationsOverviewMap.php`** + its
  Blade view. A header widget on the list page plotting all pins.

### Tier → points

- A **tier slider (1–10)** in the form. Changing it auto-fills **points** with
  `Location::defaultPointsForTier($tier)` (reactive `afterStateUpdated`); points
  remains an editable override (0–50,000).
- `Location::DEFAULT_POINTS_FOR_TIER` is the explicit OSRS-band lookup from the
  spec: `[1→100, 2→200, 3→350, 4→700, 5→1300, 6→2300, 7→4200, 8→8000,
  9→14000, 10→22000]`. `Location::defaultPointsForTier(int $tier): int`.

### Images — FileUpload + remote-URL preservation

- The form uses a multiple, reorderable **`FileUpload`** (`->image()`,
  `->disk('public')->directory('locations')`) instead of pasted URLs. Run
  `php artisan storage:link` once so uploads serve from `/storage/...`.
- `image_urls` (JSON) stores an **ordered mix** of uploaded file paths and
  remote seed URLs. On **edit**, `EditLocation::mutateFormDataBeforeFill()`
  splits remote (`http(s)://`) URLs out so the FileUpload only manages disk
  files; `mutateFormDataBeforeSave()` merges the remote URLs back in. The API
  resolves uploaded paths to absolute URLs via `Storage::disk('public')->url()`
  and passes remote URLs through unchanged.

### Category → tag taxonomy

- **`categories`** — the 9 fixed profile interests, each with an Ionicons
  `icon` (e.g. hiking → `trail-sign-outline`). Seeded by `CategorySeeder`.
- **`tags`** — creatable sub-labels belonging to one category (e.g. Hiking →
  "summit"). The form's **Tags** multi-select is searchable + preloaded and can
  **create new tags inline** (`createOptionForm`: name + parent category;
  `createOptionUsing` makes the `Tag`, slug auto-derived).
- **`location_tag`** pivot — `Location belongsToMany Tag`. A location's
  **categories are derived** from the distinct categories of its tags (computed
  in the API resource, not stored).

---

## API

Public, read-only, **no auth** (prototype). Responses are shaped to match the
app's `ExploreLocation` type exactly — camelCase keys, nested `coordinates`,
`imageUrls` / `verificationTags` arrays, string `id` (the slug), ISO `createdAt`
— plus the rich-location fields: `tier`, `geofenceRadius`, `categories` (derived
slugs), and `tags` (slugs). `imageUrls` are **absolute** (uploaded paths are run
through `Storage::url`; remote seed URLs pass through).

Only **approved** (and active) locations are exposed — pending/rejected
contributor submissions never reach the mobile app.

| Method | Path | Description |
|---|---|---|
| GET | `/api/locations` | All approved + active locations. Optional `?maxTier=N` pre-filters to `tier ≤ N` (otherwise all approved are returned and the app gates by level). |
| GET | `/api/locations/{id}` | One approved location by string id (slug), e.g. `mueller_park`. 404 if unknown/inactive/not-approved. |

### Sample response — `GET /api/locations`

Laravel API Resources wrap the payload in a `data` envelope:

```json
{
  "data": [
    {
      "id": "mueller_park",
      "name": "Mueller Park",
      "category": "parks",
      "tier": 1,
      "coordinates": { "latitude": -31.9472, "longitude": 115.8291 },
      "address": "Subiaco WA 6008",
      "points": 300,
      "geofenceRadius": 50,
      "description": "A beautiful family park in Subiaco featuring a custom play space, a double slide, and beautiful green lawns perfect for picnics and family gatherings.",
      "imageUrls": [
        "https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&q=80"
      ],
      "verificationTags": ["playground", "trees", "park", "slide", "grass"],
      "categories": ["picnicking"],
      "tags": ["shade", "playground"],
      "createdAt": "2026-01-10T12:00:00Z"
    }
    // ... 4 more
  ]
}
```

`GET /api/locations/{id}` returns the same object shape under a single `data` key.

> Each item is byte-for-byte compatible with `ExploreLocation` (`src/types/index.ts`).
> The only wrapper is the top-level `data` key — read `json.data` on the client.

---

## Data model

Table `locations` (migration:
`backend/database/migrations/*_create_locations_table.php`):

| Column | Type | Notes / maps to `ExploreLocation` |
|---|---|---|
| `id` | bigint PK | internal only — not exposed by the API |
| `slug` | string, unique | exposed as `id` (e.g. `mueller_park`) |
| `name` | string | `name` |
| `category` | string | `category` — `parks` \| `scenic` \| `food` |
| `latitude` | decimal(10,7) | `coordinates.latitude` |
| `longitude` | decimal(10,7) | `coordinates.longitude` |
| `address` | string | `address` |
| `points` | integer | `points` (default from `tier`) |
| `tier` | unsignedTinyInteger, indexed, default `1` | `tier` (1–10) — RuneScape-style level gate |
| `description` | text, nullable | `description` |
| `image_urls` | json | `imageUrls` — ordered mix of uploaded paths + remote URLs; API resolves to absolute |
| `verification_tags` | json | `verificationTags` |
| `geofence_radius_m` | integer, default `50` | `geofenceRadius` — check-in radius (range 50–20000 enforced by the form/API); matches the app's `CHECK_IN_RADIUS_M` |
| `active` | boolean, default `true` | filters the public API; not exposed |
| `status` | string, indexed, default `approved` | moderation state: `pending` / `approved` / `rejected`. Only `approved` is exposed by the API. Not in the response body. |
| `submitted_by` | FK → users, nullable | the contributor who submitted it (null for seeds / admin-created). Not exposed. |
| `created_at` / `updated_at` | timestamps | `createdAt` (ISO 8601 Zulu) |

The 5 seeded Perth records (`LocationSeeder`) are copied verbatim from the app's
`INITIAL_LOCATIONS` array in `src/utils/storage.ts`, each now given a `tier` and
1–3 tags.

### Taxonomy tables (`*_create_categories_and_tags_tables.php`)

| Table | Columns | Notes |
|---|---|---|
| `categories` | `id, name, slug (unique), icon` | the 9 fixed profile interests; `icon` is an Ionicons name |
| `tags` | `id, category_id (FK), name, slug` | `unique(category_id, slug)` — slugs unique **within** a category |
| `location_tag` | `id, location_id (FK), tag_id (FK)` | pivot; `unique(location_id, tag_id)` |

`Location belongsToMany Tag`; `Tag belongsTo Category`; `Category hasMany Tag`.

### Key files

- `app/Models/Location.php` — model (fillable + casts, `tags`, `submittedBy`, `scopeApproved`, `DEFAULT_POINTS_FOR_TIER` + `defaultPointsForTier()`)
- `app/Models/Category.php`, `app/Models/Tag.php` — taxonomy models (Tag auto-derives its slug)
- `app/Models/User.php` — `HasRoles`, `FilamentUser`, `canAccessPanel`
- `app/Policies/LocationPolicy.php` — role/ownership authorization
- `app/Http/Controllers/Api/LocationController.php` — `index` / `show` (approved-only, `?maxTier=`)
- `app/Http/Resources/LocationResource.php` — the `ExploreLocation` shape + `tier`/`geofenceRadius`/`categories`/`tags`/absolute `imageUrls`
- `routes/api.php` — route registration
- `app/Filament/Resources/Locations/` — admin resource (form / table / pages, role-scoped)
- `app/Filament/Resources/Locations/Widgets/LocationsOverviewMap.php` — list-page overview map
- `app/Filament/Forms/Components/LocationMapPicker.php` (+ Blade view) — custom map+geofence picker field
- `app/Filament/Pages/Auth/Register.php` — self-registration → contributor role
- `config/services.php` — `google_maps_key` (env `GOOGLE_MAPS_KEY`)
- `config/filament-shield.php` — super-admin = `admin` role via gate
- `database/seeders/{RoleSeeder,CategorySeeder,LocationSeeder,DatabaseSeeder}.php` — roles, taxonomy, seed data, admin + contributor users

---

## Metro note

`metro.config.js` (repo root) now adds a `resolver.blockList` that excludes
`backend/.*` so Metro does **not** crawl the Laravel app (its `vendor/`,
`storage/`, etc.). The existing `.wasm` `assetExts` config is preserved.

---

## Next step — wire the Expo app to this API

Not done yet (the app intentionally stays on mock for now). When ready:

1. Add an API base URL to the app config, e.g.
   `EXPO_PUBLIC_API_URL=http://locatour-api.test` (use your machine's LAN IP for
   a physical device; `http://10.0.2.2:8000` for the Android emulator with
   `php artisan serve`).
2. In `src/utils/storage.ts`, change `getLocations()` to `fetch` from
   `${API_URL}/api/locations` and read `json.data`, mapping each item straight
   into `ExploreLocation` (no transform needed — shapes match).
3. **Keep the mock as an offline fallback:** on fetch failure, fall back to
   `INITIAL_LOCATIONS` so the app still works offline. Optionally cache the last
   successful response.
4. Do the same for `getLocationById(id)` → `GET /api/locations/{id}`.

Leaving `points` / `category` / `verificationTags` identical means the
gamification and verification logic already in `storage.ts` keeps working
unchanged.
