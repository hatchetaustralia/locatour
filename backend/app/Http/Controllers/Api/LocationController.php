<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LocationResource;
use App\Models\Location;
use Illuminate\Http\Request;

class LocationController extends Controller
{
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
        // Return up to unlockedTier+3 so the app has everything it needs in one
        // slice: unlocked spots (≤ unlockedTier), the +1/+2 "locked teaser" band
        // surfaced in the home lists, and the +3 hidden-discoverable band the
        // camera uses. The app does the per-screen display/lock gating; anything
        // beyond +3 stays secret (never sent).
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
                $maxTier !== null,
                // Tier-gate by level, but major destinations are bucket-list
                // landmarks that are ALWAYS shown regardless of the gate.
                fn ($q) => $q->where(function ($inner) use ($maxTier) {
                    $inner->where('tier', '<=', $maxTier)
                        ->orWhere('is_major_destination', true);
                }),
            );

        $hasGeo = $request->filled('lat') && $request->filled('lng');

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

            $locations = $locations->filter(
                fn (Location $location): bool => (bool) $location->is_major_destination
                    || self::haversineMetres($lat, $lng, (float) $location->latitude, (float) $location->longitude) <= $radius,
            )->values();
        }

        return LocationResource::collection($locations);
    }

    /**
     * The highest tier (1-10) unlocked at a given player level. Mirrors the
     * app's gate exactly: every 10 levels unlocks the next tier, capped at 10.
     * unlockedTier(level) = min(10, floor((level-1)/10)+1).
     */
    private static function unlockedTier(int $level): int
    {
        return (int) min(10, intdiv(max($level, 1) - 1, 10) + 1);
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
