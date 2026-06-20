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
     * Optional ?maxTier=N pre-filters to locations the user can access; by
     * default all approved locations are returned and the app gates by level.
     */
    public function index(Request $request)
    {
        $locations = Location::query()
            ->approved()
            ->where('active', true)
            ->with('tags.category')
            ->when(
                $request->filled('maxTier'),
                fn ($query) => $query->where('tier', '<=', (int) $request->integer('maxTier')),
            )
            ->orderBy('created_at')
            ->get();

        return LocationResource::collection($locations);
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
