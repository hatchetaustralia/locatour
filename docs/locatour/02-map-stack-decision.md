# Map Stack Decision Brief — Locatour (Expo SDK 55)

_Researched 2026-06-19 (multi-agent research + adversarial verification). Driven by the product owner's requirements: the map must actually load, support a **satellite** toggle, and work **offline**._

## Bottom line
Adopt **`@maplibre/maplibre-react-native` (v11.3.4+)** as the primary native map stack, and **accept moving off Expo Go to a custom dev / EAS build.** It is the only option that satisfies all three hard requirements with first-class APIs: satellite (raster source/layer), genuine downloadable **offline regions** (`OfflineManager.createPack`), and a documented web path via `Map.web.tsx` + `maplibre-gl`. The alternatives each fail a hard requirement: **expo-maps has zero offline capability**; **react-native-maps' offline is DIY tile-overlay glue, not a download-a-region API**.

## Comparison

| Criterion | react-native-maps (1.27.2, current) | **MapLibre RN (v11.3.4) — recommended** | expo-maps (55.x, alpha) |
|---|---|---|---|
| Satellite | Yes (`mapType`), online-only imagery | Yes (raster layer; can be offline) | Yes, online-only |
| Offline | ⚠️ Partial — no region API, manual tile cache | ✅ Turnkey `OfflineManager.createPack` | ❌ None |
| Web | ❌ No real web map (mockup today) | ⚠️ Manual `.web.tsx` → maplibre-gl (works) | ❌ No |
| Expo Go | ✅ Works today | ❌ **Dev build required** | ❌ Dev build required |
| Cost | Lib free; Google needs billing | Lib free, **no API key**; cost = tiles only | Android needs Google key |
| Effort | Medium (offline = high DIY) | Moderate (web = biggest lift) | Low — but can't meet offline |

## The key tradeoff (verified)
Offline-first **requires giving up Expo Go** and moving to a custom dev client / EAS build. MapLibre ships native code; its docs state it "can't be used with Expo Go." Every dev installs a one-time dev client; CI moves to EAS builds. (react-native-maps' "true offline" claim was verified **PARTIAL** — tile-overlay caching works cross-platform but there's no region-download API and the native base map can never be downloaded.)

## Recommended satellite tiles for offline
**EOX Sentinel-2 cloudless**, packaged as raster **PMTiles**/MBTiles, bundled or hosted.
- ⚠️ **Licensing caveat:** only the **2016 vintage is CC BY 4.0** (commercial-safe). 2018–2024 are **CC BY-NC-SA (NonCommercial)** — a commercial Locatour must use 2016 or buy EOX's commercial license. Mandatory attribution string required. ~10 m/px (regional context, not street-level).
- **Avoid for offline:** Google/Bing tiles prohibit offline caching; ESRI World Imagery is online-only (not licensed for offline export). For hi-res offline later, self-host MapTiler Server + Data.

## Phased plan
- **Phase 0 — Dev-build foundation:** `npx expo install @maplibre/maplibre-react-native`, add config plugin to `app.json`, `expo prebuild`, EAS/local dev build, onboard devs. Verify a bare `MapView` renders on a real device first.
- **Phase 1 — Online map + satellite toggle:** vector basemap for "standard", `RasterSource`+`RasterLayer` for "satellite"; wire the toggle. Re-add check-in markers.
- **Phase 2 — Offline regions:** `OfflineManager.createPack({styleURL,bounds,minZoom,maxZoom})` + progress UI; call `setTileCountLimit` explicitly; add pack management; airplane-mode test.
- **Phase 3 — Offline satellite:** EOX Sentinel-2 → `gdal2tiles`/`mbutil` → `pmtiles convert` → bundle/host; resolve the NC-license decision.
- **Phase 4 — Web parity:** `Map.web.tsx` with `maplibre-gl` + `react-map-gl/maplibre`; replace the fake paper-map web mockup. (Offline packs are native-only; web stays online.)
- **Phase 5 — Hardening:** pack invalidation/refresh, cache limits, storage-pressure handling, attribution rendering (EOX + OSM).
