<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LocationResource;
use App\Models\Location;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    /**
     * Reveal-by-proximity radius (metres) for spots ABOVE the user's teaser cap.
     * Deliberately tight (2 km, NOT the app's 10 km map vicinity): this is a public,
     * unauthenticated endpoint, so a wide radius would let someone cheaply scrape /
     * "drive around" and harvest the protected high-tier spots. You must be genuinely
     * close to surface one. (Real defence = auth + rate-limit + coord-fuzzing later.)
     */
    private const REVEAL_RADIUS_M = 2000;

    /**
     * GET /api/locations
     * Returns active + APPROVED locations only (the mobile app shows
     * approved spots), in the app's ExploreLocation shape.
     *
     * Location-aware so the app only ever downloads spots relevant to the
     * user (the catalogue is growing to ~1000). Optional query params:
     *
     *   level   int   The player's level. When given, only locations with
     *                 tier <= unlockedTier(level) are returned, where
     *                 unlockedTier(level) = min(10, floor((level-1)/10)+1).
     *   lat,lng float When BOTH given, a location is included only if it is a
     *                 MAJOR DESTINATION (is_major_destination = true, always
     *                 included regardless of distance) OR it lies within
     *                 `radius` metres of (lat,lng).
     *   radius  int   Search radius in metres for the lat/lng filter.
     *                 Defaults to 200000 (200 km).
     *
     * With neither lat nor lng, ALL approved locations are returned
     * (backward compatible), still tier-filtered when `level` is present.
     *
     * Also still honours the legacy ?maxTier=N pre-filter.
     */
    public function index(Request $request)
    {
        $hasLevel = $request->filled('level');
        $hasGeo = $request->filled('lat') && $request->filled('lng');

        // The unlockedTier+3 "teaser cap" only applies to FAR spots. When we know
        // where the user is, anything within VICINITY_M is revealed regardless of
        // tier (proximity beats level-gating — a place you're standing next to
        // shouldn't be invisible because you're low level), with the cap re-applied
        // per-distance in the Haversine pass below. Without coordinates we can't
        // reveal-by-proximity, so fall back to a pure tier gate on the query here.
        $maxTier = $hasLevel
            ? min(10, self::unlockedTier((int) $request->integer('level')) + 3)
            : null;

        $query = Location::query()
            ->approved()
            ->where('active', true)
            ->with('tags.category')
            ->when(
                $request->filled('maxTier'),
                fn ($q) => $q->where('tier', '<=', (int) $request->integer('maxTier')),
            )
            ->when(
                $maxTier !== null && ! $hasGeo,
                // No-geo fallback: tier-gate by level, majors always shown.
                fn ($q) => $q->where(function ($inner) use ($maxTier) {
                    $inner->where('tier', '<=', $maxTier)
                        ->orWhere('is_major_destination', true);
                }),
            );

        if ($hasGeo) {
            $lat = (float) $request->input('lat');
            $lng = (float) $request->input('lng');
            $radius = $request->filled('radius') ? (int) $request->integer('radius') : 200000;

            // Cheap bounding-box pre-filter in SQL (deg ~ radius/111320), but
            // ALWAYS keep major destinations regardless of distance. Longitude
            // degrees shrink with latitude, so widen the lng box by 1/cos(lat).
            $latDelta = $radius / 111320;
            $cos = cos(deg2rad($lat));
            $lngDelta = $cos > 0.000001 ? $latDelta / $cos : 180;

            $query->where(function ($q) use ($lat, $lng, $latDelta, $lngDelta) {
                $q->where('is_major_destination', true)
                    ->orWhere(function ($inner) use ($lat, $lng, $latDelta, $lngDelta) {
                        $inner->whereBetween('latitude', [$lat - $latDelta, $lat + $latDelta])
                            ->whereBetween('longitude', [$lng - $lngDelta, $lng + $lngDelta]);
                    });
            });
        }

        $locations = $query->orderBy('created_at')->get();

        if ($hasGeo) {
            // Precise Haversine in PHP — the bounding box is a square superset
            // of the true circle, so trim corners. Major destinations stay in.
            $lat = (float) $request->input('lat');
            $lng = (float) $request->input('lng');
            $radius = $request->filled('radius') ? (int) $request->integer('radius') : 200000;

            $locations = $locations->filter(function (Location $location) use ($lat, $lng, $radius, $maxTier): bool {
                // Major destinations are always included, at any distance.
                if ($location->is_major_destination) {
                    return true;
                }

                $distance = self::haversineMetres($lat, $lng, (float) $location->latitude, (float) $location->longitude);

                if ($distance > $radius) {
                    return false;
                }

                // Within the reveal radius: surfaced regardless of tier (proximity wins).
                if ($distance <= self::REVEAL_RADIUS_M) {
                    return true;
                }

                // Farther out: keep the teaser cap so far high-tier spots don't flood.
                return $maxTier === null || $location->tier <= $maxTier;
            })->values();
        }

        return LocationResource::collection($locations);
    }

    /**
     * The highest tier (1-10) unlocked at a given player level. Mirrors the
     * app's leveling.ts gate exactly: tiers unlock on round decades, capped at 10.
     * unlockedTier(level) = min(10, floor(level/10)+1) — L1..9→1, L10..19→2, …,
     * L90..99→10.
     */
    private static function unlockedTier(int $level): int
    {
        return (int) min(10, intdiv(max($level, 1), 10) + 1);
    }

    /**
     * Great-circle distance between two lat/lng points in metres (Haversine).
     */
    private static function haversineMetres(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371000; // metres

        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * GET /api/locations/{id}
     * {id} is the app's string id (slug, e.g. "mueller_park").
     * Pending/rejected locations 404 from the public API.
     */
    public function show(string $id)
    {
        $location = Location::query()
            ->approved()
            ->where('active', true)
            ->with('tags.category')
            ->where('slug', $id)
            ->firstOrFail();

        return new LocationResource($location);
    }
}
