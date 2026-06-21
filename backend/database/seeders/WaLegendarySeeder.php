<?php

namespace Database\Seeders;

use App\Models\Location;
use Illuminate\Database\Seeder;

/**
 * Curated "legendary" Locatour locations for Western Australia, covering
 * the state's most iconic and remote public-land destinations (Tiers 7-10).
 *
 * Idempotent: upserts keyed on `name` so re-running is safe. Points are set
 * via defaultPointsForTier(tier) so the saving() hook's tierForPoints() call
 * derives the correct tier back from points, keeping both fields consistent.
 * updateOrCreate() runs save() so the hook fires (do NOT use Model::where()->update()).
 */
class WaLegendarySeeder extends Seeder
{
    public function run(): void
    {
        $locations = [
            // --- Tier 7 ---
            [
                'slug' => 'wa_legendary_wave_rock',
                'name' => 'Wave Rock',
                'category' => 'scenic',
                'latitude' => -32.4435,
                'longitude' => 118.8983,
                'address' => 'Wave Rock Rd, Hyden WA 6359, Australia',
                'tier' => 7,
                'is_major_destination' => true,
                'description' => 'Wave Rock — a 110-metre granite monolith that curls like a breaking wave, striped with mineral stains and rising from the flat wheatbelt plain.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_wave_rock',
            ],
            [
                'slug' => 'wa_legendary_the_pinnacles',
                'name' => 'The Pinnacles (Nambung National Park)',
                'category' => 'scenic',
                'latitude' => -30.6044,
                'longitude' => 115.1568,
                'address' => 'Pinnacles Dr, Cervantes WA 6511, Australia',
                'tier' => 7,
                'is_major_destination' => true,
                'description' => 'The Pinnacles — thousands of ancient limestone spires rising from a golden desert floor, casting long shadows at dawn inside Nambung National Park.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_the_pinnacles',
            ],
            [
                'slug' => 'wa_legendary_bluff_knoll',
                'name' => 'Bluff Knoll (Stirling Range National Park)',
                'category' => 'parks',
                'latitude' => -34.3728,
                'longitude' => 118.2497,
                'address' => 'Bluff Knoll Rd, Amelup WA 6338, Australia',
                'tier' => 7,
                'is_major_destination' => true,
                'description' => 'Bluff Knoll — the highest peak in the Stirling Range, where cloud-shrouded heath and rare wildflowers reward the climb with sweeping views across the southern WA plains.',
                'image_urls' => ['https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_bluff_knoll',
            ],
            [
                'slug' => 'wa_legendary_hamelin_pool_stromatolites',
                'name' => 'Hamelin Pool Stromatolites',
                'category' => 'scenic',
                'latitude' => -26.3987,
                'longitude' => 114.2200,
                'address' => 'Hamelin Pool Marine Nature Reserve, Shark Bay WA 6537, Australia',
                'tier' => 7,
                'is_major_destination' => true,
                'description' => 'Hamelin Pool Stromatolites — living rocks built by microbes that are among the oldest life forms on Earth, quietly colonising the hypersaline shallows of Shark Bay.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_hamelin_pool_stromatolites',
            ],

            // --- Tier 8 ---
            [
                'slug' => 'wa_legendary_lucky_bay',
                'name' => 'Lucky Bay (Cape Le Grand National Park)',
                'category' => 'scenic',
                'latitude' => -34.0006,
                'longitude' => 122.2293,
                'address' => 'Lucky Bay, Cape Le Grand National Park, Esperance WA 6450, Australia',
                'tier' => 8,
                'is_major_destination' => true,
                'description' => 'Lucky Bay — a sweeping crescent of powder-white sand and turquoise water in Cape Le Grand National Park, where kangaroos regularly laze at the tide line.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_lucky_bay',
            ],
            [
                'slug' => 'wa_legendary_natures_window',
                'name' => "Nature's Window (Kalbarri National Park)",
                'category' => 'scenic',
                'latitude' => -27.7156,
                'longitude' => 114.4615,
                'address' => "Nature's Window, Kalbarri National Park, Kalbarri WA 6536, Australia",
                'tier' => 8,
                'is_major_destination' => true,
                'description' => "Nature's Window — a wind-sculpted rock archway that perfectly frames the Murchison River gorge far below, one of the most photographed vistas in outback WA.",
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_natures_window',
            ],
            [
                'slug' => 'wa_legendary_hutt_lagoon_pink_lake',
                'name' => 'Hutt Lagoon (Pink Lake)',
                'category' => 'scenic',
                'latitude' => -28.0556,
                'longitude' => 114.2247,
                'address' => 'Hutt Lagoon, Port Gregory WA 6535, Australia',
                'tier' => 8,
                'is_major_destination' => true,
                'description' => 'Hutt Lagoon — a vast pink salt lake near Port Gregory, tinted vivid magenta by carotenoid-rich algae, best seen from above at dawn or dusk.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_hutt_lagoon_pink_lake',
            ],
            [
                'slug' => 'wa_legendary_hellfire_bay',
                'name' => 'Hellfire Bay (Cape Le Grand National Park)',
                'category' => 'scenic',
                'latitude' => -34.0086,
                'longitude' => 122.1664,
                'address' => 'Hellfire Bay, Cape Le Grand National Park, Esperance WA 6450, Australia',
                'tier' => 8,
                'is_major_destination' => true,
                'description' => 'Hellfire Bay — a secluded cove of luminous turquoise water hemmed by granite boulders, accessible only on foot from a red-dirt trail through coastal heath.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_hellfire_bay',
            ],

            // --- Tier 9 ---
            [
                'slug' => 'wa_legendary_karijini_dales_gorge',
                'name' => 'Karijini National Park (Dales Gorge)',
                'category' => 'parks',
                'latitude' => -22.4783,
                'longitude' => 118.5586,
                'address' => 'Dales Gorge, Karijini National Park, Pilbara WA 6751, Australia',
                'tier' => 9,
                'is_major_destination' => true,
                'description' => 'Karijini Dales Gorge — ancient red gorges sliced through Pilbara ironstone, hiding emerald rock pools and cascading waterfalls deep below the spinifex plateau.',
                'image_urls' => ['https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_karijini_dales_gorge',
            ],
            [
                'slug' => 'wa_legendary_cable_beach',
                'name' => 'Cable Beach',
                'category' => 'scenic',
                'latitude' => -17.9614,
                'longitude' => 122.2092,
                'address' => 'Cable Beach, Broome WA 6725, Australia',
                'tier' => 9,
                'is_major_destination' => true,
                'description' => 'Cable Beach — 22 kilometres of rust-red dunes meeting a cobalt Kimberley sea, famous for camel trains silhouetted against incandescent tropical sunsets.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_cable_beach',
            ],
            [
                'slug' => 'wa_legendary_lake_argyle',
                'name' => 'Lake Argyle',
                'category' => 'scenic',
                'latitude' => -16.1153,
                'longitude' => 128.7392,
                'address' => 'Lake Argyle, Kununurra WA 6743, Australia',
                'tier' => 9,
                'is_major_destination' => true,
                'description' => "Lake Argyle — Australia's largest reservoir spreads across rugged Kimberley ranges, its sunrise-gilded surface alive with freshwater crocodiles and vast flocks of waterbirds.",
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_lake_argyle',
            ],
            [
                'slug' => 'wa_legendary_turquoise_bay',
                'name' => 'Turquoise Bay (Ningaloo / Cape Range NP)',
                'category' => 'scenic',
                'latitude' => -22.1000,
                'longitude' => 113.8900,
                'address' => 'Turquoise Bay, Cape Range National Park, Exmouth WA 6707, Australia',
                'tier' => 9,
                'is_major_destination' => true,
                'description' => 'Turquoise Bay — a drift-snorkel paradise on the Ningaloo Reef where you fin over coral gardens teeming with reef fish, turtles and manta rays in water of impossible clarity.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_turquoise_bay',
            ],

            // --- Tier 10 ---
            [
                'slug' => 'wa_legendary_horizontal_falls',
                'name' => 'Horizontal Falls (Talbot Bay)',
                'category' => 'scenic',
                'latitude' => -16.3836,
                'longitude' => 123.9869,
                'address' => 'Talbot Bay, Kimberley WA 6725, Australia',
                'tier' => 10,
                'is_major_destination' => true,
                'description' => 'Horizontal Falls — a geological wonder of the Kimberley where tidal surges pour through narrow cliff gorges creating roaring horizontal rapids, accessible only by seaplane or fast boat.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_horizontal_falls',
            ],
            [
                'slug' => 'wa_legendary_bungle_bungle_range',
                'name' => 'Bungle Bungle Range (Purnululu National Park)',
                'category' => 'scenic',
                'latitude' => -17.4983,
                'longitude' => 128.3866,
                'address' => 'Purnululu National Park, Kimberley WA 6770, Australia',
                'tier' => 10,
                'is_major_destination' => true,
                'description' => 'Bungle Bungle Range — a UNESCO World Heritage beehive karst of orange and black-banded sandstone domes, hidden deep in the Kimberley and reachable only by 4WD or aircraft.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_bungle_bungle_range',
            ],
            [
                'slug' => 'wa_legendary_mitchell_falls',
                'name' => 'Mitchell Falls (Punamii-Unpuu)',
                'category' => 'scenic',
                'latitude' => -14.8200,
                'longitude' => 125.7100,
                'address' => 'Mitchell River National Park, Kimberley WA 6725, Australia',
                'tier' => 10,
                'is_major_destination' => true,
                'description' => 'Mitchell Falls — a four-tiered cascade plunging into a sacred ochre gorge in the remote Mitchell Plateau, reached only after a full-day trek through ancient Wandjina country.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_mitchell_falls',
            ],
            [
                'slug' => 'wa_legendary_cape_leveque',
                'name' => 'Cape Leveque (Kooljaman)',
                'category' => 'scenic',
                'latitude' => -16.3940,
                'longitude' => 122.9270,
                'address' => 'Cape Leveque, Dampier Peninsula WA 6725, Australia',
                'tier' => 10,
                'is_major_destination' => true,
                'description' => 'Cape Leveque — the dramatic red-cliff tip of the Dampier Peninsula where the Indian Ocean crashes into flaming ochre headlands, on traditional Bardi Jawi country accessible only by corrugated 4WD track.',
                'image_urls' => ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80'],
                'geofence_radius_m' => 500,
                'place_id' => 'seed_legendary_wa_cape_leveque',
            ],
        ];

        foreach ($locations as $data) {
            $data['points'] = Location::defaultPointsForTier($data['tier']);

            Location::updateOrCreate(
                ['name' => $data['name']],
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
