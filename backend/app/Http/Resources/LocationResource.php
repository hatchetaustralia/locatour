<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LocationResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * Shaped to MATCH the Expo app's ExploreLocation type exactly
     * (src/types/index.ts): string `id`, camelCase keys, nested
     * `coordinates`, `imageUrls`/`verificationTags` arrays, ISO `createdAt`.
     * This lets the app swap storage.getLocations() for this endpoint with
     * no transformation.
     *
     * Rich-location fields (spec 06): `tier`, `geofenceRadius`, `categories`
     * (derived slugs), `tags` (names + slugs). `imageUrls` resolves uploaded
     * file paths to absolute URLs while passing remote seed URLs through.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->slug,
            'name' => $this->name,
            'category' => $this->category,
            'tier' => (int) $this->tier,
            'isMajorDestination' => (bool) $this->is_major_destination,
            'coordinates' => [
                'latitude' => (float) $this->latitude,
                'longitude' => (float) $this->longitude,
            ],
            'address' => $this->address,
            'points' => (int) $this->points,
            'geofenceRadius' => (int) $this->geofence_radius_m,
            'description' => $this->description ?? '',
            'imageUrls' => $this->resolveImageUrls(),
            'verificationTags' => $this->verification_tags ?? [],
            'categories' => $this->resolveCategorySlugs(),
            'tags' => $this->resolveTagSlugs(),
            'createdAt' => optional($this->created_at)->toIso8601ZuluString(),

            // Public-facing visitor metadata (spec 07). All optional — null/empty
            // means "unknown", never "no".
            'tierRationale' => $this->tier_rationale,
            'accessibility' => $this->accessibility ?? [],
            'amenities' => $this->amenities ?? [],
            'openingHours' => $this->opening_hours,
            'dogFriendly' => $this->dog_friendly,
            'familyFriendly' => $this->family_friendly,
            'rating' => $this->google_rating !== null ? (float) $this->google_rating : null,
            'ratingCount' => $this->google_rating_count,
            'priceLevel' => $this->price_level,
            'businessStatus' => $this->business_status,
            'primaryType' => $this->primary_type_label,
            'website' => $this->website_uri,
            'phone' => $this->phone,
            'directionsUri' => $this->directions_uri,
            'plusCode' => $this->plus_code,
            'viewport' => $this->viewport,
        ];
    }

    /**
     * Resolve the stored image_urls (an ordered mix of uploaded file paths
     * and remote URLs) to absolute URLs. Anything that already looks like an
     * absolute URL is passed through; everything else is treated as a path on
     * the `public` disk and run through Storage::url.
     *
     * @return array<int, string>
     */
    protected function resolveImageUrls(): array
    {
        return collect($this->image_urls ?? [])
            ->filter()
            ->map(fn (string $path): string => Str::startsWith($path, ['http://', 'https://'])
                ? $path
                : Storage::disk('public')->url($path))
            ->values()
            ->all();
    }

    /**
     * The location's categories, derived from the distinct categories of its
     * tags, as Ionicons-friendly slugs (matches the app's interest ids).
     *
     * @return array<int, string>
     */
    protected function resolveCategorySlugs(): array
    {
        return $this->tags
            ->pluck('category')
            ->filter()
            ->pluck('slug')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * The location's tags as slugs (per the API contract `tags: string[]`).
     * Slugs are unique within their category; the app keys off them.
     *
     * @return array<int, string>
     */
    protected function resolveTagSlugs(): array
    {
        return $this->tags
            ->pluck('slug')
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
