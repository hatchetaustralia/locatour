# Google Play Console — Graphics & Configuration

**Hand this whole folder to a designer** — it contains every graphic the Google
Play Store listing needs, the exact specs, and the brand palette to work from.
The full set of console settings/answers (data safety, ratings, descriptions,
etc.) lives in **[configuration-overview.md](./configuration-overview.md)**.

> The graphics here are **auto-generated working versions** (good enough to ship
> internal/closed testing). A designer should replace them with polished art at
> the **same dimensions** listed below.

---

## What's in this folder

| File | What it is | Exact spec (Play requirement) |
|------|-----------|-------------------------------|
| `app-icon-512.png` | App icon | **512 × 512** PNG/JPEG, ≤ 1 MB, no alpha/rounding (Play masks it) |
| `feature-graphic-1024x500.png` | Feature graphic (top banner) | **1024 × 500** PNG/JPEG, ≤ 15 MB. Keep text away from edges |
| `screenshots/01-home.png` … `04-profile.png` | Phone screenshots | **1080 × 1920** (9:16) PNG/JPEG, ≤ 8 MB each, 2–8 shots. Same files satisfy 7" and 10" **tablet** too (1080–7680 px) |
| *(not yet made)* Promo video | Optional | YouTube URL (public/unlisted, ads off, not age-restricted) |

### Apple App Store note
Same source art, different export sizes. Apple needs the icon at 1024×1024 and
device-specific screenshot sizes (6.7"/6.5" iPhone, 12.9" iPad). Design at high
res so both stores can be exported.

---

## Brand palette (use these)
| Token | Hex | Use |
|-------|-----|-----|
| Cream | `#FCF0E8` | backgrounds |
| Ink | `#2A1A14` | primary text |
| Purple | `#7C5CFF` | accent / CTAs |
| Gold | `#B46C00` | tagline / points |
| Red | `#D1453B` | logo mark / pins |
| Teal/Green | sticker green | secondary accents |

- **Tagline:** "Creating memorable experiences."
- **Logo / wordmark:** `wiki/src/assets/logo.svg` (and the passport-stamp stickers in `assets/images/brand/`).
- **Source app screens** the screenshots were framed from: `wiki/src/assets/screens/` (home, explore, checkin, checked-in, profile).

---

## Listing copy (for context)
- **App name:** Locatour
- **Short description (≤80):** *A game you play by going outside. Explore real places, check in, level up.*
- **Full description:** see `docs/locatour/12-play-store-listing.md`.
- **What the app is:** a real-world exploration game — visit public parks, lookouts, beaches and hidden spots, check in with a photo, earn XP and level up. Brand is warm, outdoorsy, playful (passport-stamp motif).

## Screenshot captions (current)
1. **Real places near you** — "Parks, lookouts, beaches & hidden gems"
2. **Explore the map** — "Every pin is a spot worth visiting"
3. **Check in & earn XP** — "Snap a photo to prove you were there"
4. **Level up as you explore** — "Track your streak, XP and discoveries"

A designer can keep these captions or rework them — just stay within the 9:16 frame and the palette above.
