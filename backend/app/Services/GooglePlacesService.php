<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * On-demand enrichment from the Google Places API (New).
 *
 * Mirrors the HTTP approach already used by Api\PlacesController and the admin
 * map picker: the server-side GOOGLE_MAPS_KEY (config('services.google_maps_key'))
 * with the `X-Goog-Api-Key` + `X-Goog-FieldMask` header style of the v1 Places
 * endpoints. Calls here are BILLED PER REQUEST, so everything is on-demand —
 * there are deliberately no bulk loops. The admin triggers a single
 * details()/downloadPhotos() pass per location when enriching it.
 *
 * NOTE: Google's official Places API does NOT expose popular-times / busyness
 * ("how busy is it now") data. That is only on the consumer Maps surface and
 * scraping it violates Google's ToS — do not attempt it. Only the fields the
 * API actually returns are normalised below.
 */
class GooglePlacesService
{
    /** Base host for the Places API (New). */
    private const BASE = 'https://places.googleapis.com/v1';

    private function key(): ?string
    {
        return config('services.google_maps_key');
    }

    /**
     * Best-effort resolution of a Google place id from a name + coordinates,
     * for locations that were never created from a Places pick (e.g. seeded or
     * map-dragged spots). Uses Text Search (New) biased to a tight circle around
     * the known coordinates so the nearest same-named place wins. Returns null
     * (never throws) when there's no key, no match, or the lookup fails — the
     * caller treats "couldn't resolve" as a soft outcome.
     */
    public function resolvePlaceId(string $name, float $lat, float $lng): ?string
    {
        $key = $this->key();
        $name = trim($name);
        if (! $key || $name === '') {
            return null;
        }

        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                    'X-Goog-Api-Key' => $key,
                    'X-Goog-FieldMask' => 'places.id',
                ])
                ->post(self::BASE . '/places:searchText', [
                    'textQuery' => $name,
                    'maxResultCount' => 1,
                    // Bias (not restrict) to a 1 km circle around the pin so a
                    // slightly-off coordinate still matches the right place.
                    'locationBias' => [
                        'circle' => [
                            'center' => ['latitude' => $lat, 'longitude' => $lng],
                            'radius' => 1000.0,
                        ],
                    ],
                ]);

            if (! $response->successful()) {
                return null;
            }

            $id = $response->json('places.0.id');

            return is_string($id) && $id !== '' ? $id : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Fetch + normalise a Place's details. "Pull everything" the API exposes:
     * identity, address (formatted + components), geometry/viewport, social
     * proof (rating/count), price level, business status, types, opening hours
     * (periods + human weekday text), contact (website + phone), editorial
     * summary, the Google Maps URL, and the photo references (their `name`s,
     * which downloadPhotos() consumes).
     *
     * Returns a normalised array; the caller persists `raw` (the full response)
     * alongside the flattened columns. Throws on a hard failure so the UI can
     * surface it; an unconfigured key returns an empty-ish shape instead.
     *
     * @return array<string, mixed>
     */
    public function details(string $placeId): array
    {
        $key = $this->key();
        if (! $key) {
            throw new \RuntimeException('Google Maps key not configured (GOOGLE_MAPS_KEY).');
        }

        $placeId = trim($placeId);
        if ($placeId === '') {
            throw new \InvalidArgumentException('A Google place id is required.');
        }

        // Comprehensive field mask — request every public-useful field. The New
        // API bills by SKU based on which fields are requested; this is the
        // "everything we store" set. (No atmosphere busyness field exists.)
        $fieldMask = implode(',', [
            'id',
            'displayName',
            'formattedAddress',
            'shortFormattedAddress',
            'addressComponents',
            'location',
            'viewport',
            'plusCode',
            'rating',
            'userRatingCount',
            'priceLevel',
            'businessStatus',
            'types',
            'primaryType',
            'primaryTypeDisplayName',
            'regularOpeningHours',
            'currentOpeningHours',
            'websiteUri',
            'googleMapsUri',
            'internationalPhoneNumber',
            'nationalPhoneNumber',
            'editorialSummary',
            'photos',
        ]);

        $response = Http::timeout(12)
            ->withHeaders([
                'X-Goog-Api-Key' => $key,
                'X-Goog-FieldMask' => $fieldMask,
            ])
            ->get(self::BASE . "/places/{$placeId}");

        if (! $response->successful()) {
            throw new \RuntimeException(
                "Google Place Details request failed (HTTP {$response->status()}): "
                . $response->json('error.message', 'unknown error')
            );
        }

        $data = $response->json() ?? [];

        $regularHours = $data['regularOpeningHours'] ?? null;
        $primaryLabel = $data['primaryTypeDisplayName']['text'] ?? null;

        return [
            'place_id' => $data['id'] ?? $placeId,
            'name' => $data['displayName']['text'] ?? null,
            'formatted_address' => $data['formattedAddress'] ?? null,
            'short_address' => $data['shortFormattedAddress'] ?? null,
            'address_components' => $data['addressComponents'] ?? null,
            'location' => isset($data['location']['latitude'], $data['location']['longitude'])
                ? [
                    'lat' => (float) $data['location']['latitude'],
                    'lng' => (float) $data['location']['longitude'],
                ]
                : null,
            'viewport' => $data['viewport'] ?? null,
            'plus_code' => $data['plusCode']['globalCode'] ?? ($data['plusCode']['compoundCode'] ?? null),
            'rating' => isset($data['rating']) ? (float) $data['rating'] : null,
            'user_ratings_total' => isset($data['userRatingCount']) ? (int) $data['userRatingCount'] : null,
            // New API price level is an enum string (PRICE_LEVEL_INEXPENSIVE …);
            // map it to a 0-4 tinyint so the column stays numeric/sortable.
            'price_level' => $this->normalisePriceLevel($data['priceLevel'] ?? null),
            'price_level_label' => $data['priceLevel'] ?? null,
            'business_status' => $data['businessStatus'] ?? null,
            'types' => $data['types'] ?? null,
            'primary_type' => $data['primaryType'] ?? null,
            'primary_type_label' => $primaryLabel,
            'opening_hours' => $regularHours ? [
                'open_now' => $regularHours['openNow'] ?? null,
                'periods' => $regularHours['periods'] ?? null,
                'weekday_text' => $regularHours['weekdayDescriptions'] ?? null,
            ] : null,
            'website' => $data['websiteUri'] ?? null,
            'url' => $data['googleMapsUri'] ?? null,
            'phone' => $data['internationalPhoneNumber'] ?? ($data['nationalPhoneNumber'] ?? null),
            'phone_national' => $data['nationalPhoneNumber'] ?? null,
            'editorial_summary' => $data['editorialSummary']['text'] ?? null,
            // Photo `name`s (e.g. "places/ChIJ…/photos/AeJ…"); feed to downloadPhotos().
            'photo_refs' => collect($data['photos'] ?? [])
                ->pluck('name')
                ->filter()
                ->values()
                ->all(),
            // The full untouched response — persisted to `raw` so nothing is lost.
            'raw' => $data,
        ];
    }

    /**
     * Download up to $max Place Photos (the binary image bytes) and store them
     * on the `public` disk (R2 in prod via PUBLIC_DISK_DRIVER=s3) under
     * `location-photos/{placeId}/{n}.jpg`. Returns the public URLs.
     *
     * Resilient by design: a failed/oversized photo is skipped, never fatal, so
     * a single bad ref can't sink the whole enrichment. Each fetch is capped at
     * ~1600px and a sane byte ceiling.
     *
     * @param  array<int, string>  $photoRefs  Photo `name`s from details()['photo_refs'].
     * @return array<int, string>  Public URLs of the stored photos.
     */
    public function downloadPhotos(string $placeId, array $photoRefs, int $max = 6): array
    {
        $key = $this->key();
        if (! $key || empty($photoRefs)) {
            return [];
        }

        $placeId = trim($placeId);
        $disk = Storage::disk('public');
        $folder = 'location-photos/' . Str::of($placeId)->replace(['/', '\\'], '_');

        // Hard ceiling on stored bytes per photo (~6 MB) — skip anything larger.
        $maxBytes = 6 * 1024 * 1024;

        $urls = [];
        $n = 0;

        foreach (array_slice($photoRefs, 0, max(0, $max)) as $ref) {
            $ref = ltrim((string) $ref, '/');
            if ($ref === '') {
                continue;
            }

            try {
                // Place Photo (New): GET /v1/{photo.name}/media → 302 to the image
                // bytes (Laravel follows the redirect). maxWidthPx caps the size.
                $response = Http::timeout(15)
                    ->withHeaders(['X-Goog-Api-Key' => $key])
                    ->get(self::BASE . "/{$ref}/media", [
                        'maxWidthPx' => 1600,
                    ]);

                if (! $response->successful()) {
                    continue;
                }

                $bytes = $response->body();
                if ($bytes === '' || strlen($bytes) > $maxBytes) {
                    continue;
                }

                $path = "{$folder}/{$n}.jpg";
                $disk->put($path, $bytes);
                $urls[] = $disk->url($path);
                $n++;
            } catch (\Throwable $e) {
                // Skip this photo; keep going.
                continue;
            }
        }

        return $urls;
    }

    /**
     * Map the New API's price-level enum to a 0-4 integer (legacy scale):
     * FREE→0, INEXPENSIVE→1, MODERATE→2, EXPENSIVE→3, VERY_EXPENSIVE→4.
     */
    private function normalisePriceLevel(?string $enum): ?int
    {
        return match ($enum) {
            'PRICE_LEVEL_FREE' => 0,
            'PRICE_LEVEL_INEXPENSIVE' => 1,
            'PRICE_LEVEL_MODERATE' => 2,
            'PRICE_LEVEL_EXPENSIVE' => 3,
            'PRICE_LEVEL_VERY_EXPENSIVE' => 4,
            default => null,
        };
    }
}
