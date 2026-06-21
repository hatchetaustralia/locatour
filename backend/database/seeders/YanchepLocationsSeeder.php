<?php

namespace Database\Seeders;

use App\Models\Location;
use Illuminate\Database\Seeder;

class YanchepLocationsSeeder extends Seeder
{
    /**
     * Real public places within ~20km of Yanchep, WA, sourced from the Google
     * Places API (New) Text Search. Idempotent: upserts by `slug` so re-running
     * is safe. Tier is derived from `points` by the Location model's saving()
     * hook, so we set `points` (= defaultPointsForTier) and let tier follow.
     */
    public function run(): void
    {
        // Fix the existing Yanchep Lagoon row (it was pinned inland at the
        // national park). Find by name and call save() so the model hook
        // recomputes tier/points — do NOT use Model::where()->update(), which
        // bypasses the saving() hook.
        $lagoon = Location::where('name', 'like', 'Yanchep Lagoon%')->first();
        if ($lagoon) {
            $lagoon->latitude = -31.5499347;
            $lagoon->longitude = 115.6241774;
            $lagoon->address = '5 Brazier Rd, Yanchep WA 6035';
            $lagoon->geofence_radius_m = 300;
            $lagoon->save();
        }

        // Generic WA-nature placeholder image pool (reused across entries).
        $img = [
            'beach' => 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
            'coast' => 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4',
            'bush' => 'https://images.unsplash.com/photo-1439066615861-d1af74d74000',
            'sunset' => 'https://images.unsplash.com/photo-1500534623283-312aade485b7',
        ];

        $locations = [
            [
                'slug' => 'yanchep_national_park',
                'name' => 'Yanchep National Park',
                'category' => 'parks',
                'latitude' => -31.5487,
                'longitude' => 115.68533,
                'address' => 'Yanchep Beach Rd & Indian Ocean Dr, Yanchep WA 6035',
                'tier' => 1,
                'description' => 'Spot wild koalas, kangaroos and black cockatoos in this much-loved bushland park, then wander the boardwalks around the wetlands. A great day out for the whole family.',
                'image_urls' => [$img['bush'], $img['sunset']],
                'geofence_radius_m' => 250,
            ],
            [
                'slug' => 'yanchep_crystal_cave',
                'name' => 'Yanchep Crystal Cave',
                'category' => 'scenic',
                'latitude' => -31.54757,
                'longitude' => 115.69266,
                'address' => 'Yanchep WA 6035',
                'tier' => 3,
                'description' => 'Descend underground into a glittering limestone cave full of delicate stalactites and reflective pools. A cool, otherworldly hideaway beneath the bush.',
                'image_urls' => [$img['coast'], $img['beach']],
                'geofence_radius_m' => 150,
            ],
            [
                'slug' => 'loch_mcness',
                'name' => 'Loch McNess',
                'category' => 'parks',
                'latitude' => -31.53389,
                'longitude' => 115.67556,
                'address' => 'Loch McNess, Yanchep WA 6035',
                'tier' => 2,
                'description' => 'A peaceful spring-fed lake fringed by paperbarks and reeds, brilliant for a lazy paddle or a picnic with the local waterbirds.',
                'image_urls' => [$img['bush'], $img['sunset']],
                'geofence_radius_m' => 200,
            ],
            [
                'slug' => 'two_rocks_marina',
                'name' => 'Two Rocks Marina',
                'category' => 'scenic',
                'latitude' => -31.49484,
                'longitude' => 115.58299,
                'address' => '1 Pope St, Two Rocks WA 6037',
                'tier' => 2,
                'description' => 'A breezy working marina where fishing boats bob beside the breakwater. Grab some fish and chips and watch the sun melt into the Indian Ocean.',
                'image_urls' => [$img['coast'], $img['beach']],
                'geofence_radius_m' => 250,
            ],
            [
                'slug' => 'pipidinny_beach',
                'name' => 'Pippidinny Beach',
                'category' => 'scenic',
                'latitude' => -31.5843,
                'longitude' => 115.64488,
                'address' => 'Pippidinny Rd, Eglinton WA 6034',
                'tier' => 2,
                'description' => 'A wild, dune-backed stretch of coast with rarely a soul in sight — perfect for long beach walks and 4WD adventures away from the crowds.',
                'image_urls' => [$img['beach'], $img['sunset']],
                'geofence_radius_m' => 300,
            ],
            [
                'slug' => 'mary_lindsay_homestead',
                'name' => 'Mary Lindsay Homestead',
                'category' => 'parks',
                'latitude' => -31.54474,
                'longitude' => 115.62294,
                'address' => 'Capricorn Esplanade, Yanchep WA 6035',
                'tier' => 1,
                'description' => 'A charming heritage homestead and green reserve right by the coast, with shady lawns and a slice of local history to soak up.',
                'image_urls' => [$img['bush'], $img['coast']],
                'geofence_radius_m' => 150,
            ],
            [
                'slug' => 'yanchep_beach',
                'name' => 'Yanchep Beach',
                'category' => 'scenic',
                'latitude' => -31.54115,
                'longitude' => 115.61677,
                'address' => 'Yanchep Beach, Yanchep WA 6035',
                'tier' => 1,
                'description' => 'Soft white sand and clear shallows make this the go-to swimming beach for Yanchep locals. Sunsets here are pure gold.',
                'image_urls' => [$img['beach'], $img['sunset']],
                'geofence_radius_m' => 300,
            ],
            [
                'slug' => 'yanchep_sun_city_country_club',
                'name' => 'Yanchep Sun City Country Club',
                'category' => 'parks',
                'latitude' => -31.54646,
                'longitude' => 115.65422,
                'address' => '144 St Andrews Dr, Yanchep WA 6035',
                'tier' => 1,
                'description' => 'Rolling green fairways and big coastal skies — a relaxed spot for a round of golf or just a stroll past the manicured greens.',
                'image_urls' => [$img['bush'], $img['sunset']],
                'geofence_radius_m' => 200,
            ],
            [
                'slug' => 'capricorn_esplanade',
                'name' => 'Capricorn Esplanade',
                'category' => 'scenic',
                'latitude' => -31.54174,
                'longitude' => 115.62111,
                'address' => 'Capricorn Esplanade, Yanchep WA 6035',
                'tier' => 1,
                'description' => 'A breezy beachfront esplanade lined with grassy foreshore and ocean views — ideal for a coffee, a picnic or a sunset cycle.',
                'image_urls' => [$img['coast'], $img['beach']],
                'geofence_radius_m' => 200,
            ],
            [
                'slug' => 'wreck_point',
                'name' => 'Wreck Point',
                'category' => 'scenic',
                'latitude' => -31.50286,
                'longitude' => 115.58392,
                'address' => '8 Marcon St, Two Rocks WA 6037',
                'tier' => 3,
                'description' => 'A rugged coastal lookout with sweeping ocean panoramas and crashing surf below. A quiet vantage point that rewards those who seek it out.',
                'image_urls' => [$img['bush'], $img['sunset']],
                'geofence_radius_m' => 150,
            ],
        ];

        foreach ($locations as $data) {
            // points drives tier (the model's saving() hook recomputes tier from
            // points). Use the per-tier default so the two stay consistent.
            $data['points'] = Location::defaultPointsForTier($data['tier']);

            Location::updateOrCreate(
                ['slug' => $data['slug']],
                array_merge($data, [
                    'verification_tags' => [],
                    'active' => true,
                    'status' => Location::STATUS_APPROVED,
                    'submitted_by' => null,
                ])
            );
        }
    }
}
