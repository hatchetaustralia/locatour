<?php

namespace App\Http\Controllers\Admin;

use App\Filament\Resources\Locations\LocationResource;
use App\Http\Controllers\Controller;
use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Lazily serves the rich content for a single location's overview-map popup.
 *
 * The overview map keeps its marker array intentionally lightweight (id, lat,
 * lng, tier); this endpoint is hit only when an admin actually clicks a marker,
 * so the heavy metadata (image, points, check-in count, address) is never
 * shipped for the whole catalogue upfront. Admin-only — registered behind the
 * Filament panel's auth middleware in routes/web.php.
 */
class LocationPopupController extends Controller
{
    /** GET /admin/locations/{location}/popup */
    public function show(Location $location): JsonResponse
    {
        return response()->json([
            'name' => $location->name,
            'tier' => (int) $location->tier,
            'category' => $location->category,
            'points' => (int) $location->points,
            'imageUrl' => $this->firstImageUrl($location),
            'checkInCount' => $location->checkIns()->count(),
            'status' => $location->status,
            'address' => $location->address,
            'editUrl' => LocationResource::getUrl('edit', ['record' => $location]),
        ]);
    }

    /**
     * The location's first gallery image as an absolute URL, mirroring how
     * LocationResource resolves image_urls (remote URLs pass through; disk
     * paths run through Storage::url). Null when there are no images.
     */
    protected function firstImageUrl(Location $location): ?string
    {
        $first = collect($location->image_urls ?? [])->filter()->first();

        if (! $first) {
            return null;
        }

        return Str::startsWith($first, ['http://', 'https://'])
            ? $first
            : Storage::disk('public')->url($first);
    }
}
