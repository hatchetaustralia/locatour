<?php

namespace Database\Seeders;

use App\Models\Location;
use App\Models\Tag;
use Illuminate\Database\Seeder;

class LocationSeeder extends Seeder
{
    /**
     * The 5 seeded Perth locations, copied verbatim from the Expo app's
     * INITIAL_LOCATIONS array in src/utils/storage.ts so the API is a
     * drop-in replacement for the mock data layer.
     */
    public function run(): void
    {
        $locations = [
            [
                'slug' => 'mueller_park',
                'name' => 'Mueller Park',
                'category' => 'parks',
                'latitude' => -31.9472,
                'longitude' => 115.8291,
                'address' => 'Subiaco WA 6008',
                'points' => 300,
                'tier' => 1,
                'tags' => ['picnicking:playground', 'picnicking:shade'],
                'description' => 'A beautiful family park in Subiaco featuring a custom play space, a double slide, and beautiful green lawns perfect for picnics and family gatherings.',
                'image_urls' => [
                    'https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=600&q=80',
                    'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&q=80',
                ],
                'verification_tags' => ['playground', 'trees', 'park', 'slide', 'grass'],
                'created_at' => '2026-01-10T12:00:00Z',
            ],
            [
                'slug' => 'kings_park_lookout',
                'name' => 'Kings Park Lookout',
                'category' => 'scenic',
                'latitude' => -31.9610,
                'longitude' => 115.8422,
                'address' => 'Fraser Ave, Perth WA 6005',
                'points' => 500,
                'tier' => 3,
                'tags' => ['photography:sunset', 'photography:cityscape', 'hiking:summit'],
                'description' => 'A gorgeous scenic viewpoint overlooking the Swan River and Perth CBD. Ideal for sunrise and sunset photography with beautiful botanic gardens.',
                'image_urls' => [
                    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80',
                    'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=600&q=80',
                ],
                'verification_tags' => ['city view', 'river', 'lookout', 'war memorial', 'garden'],
                'created_at' => '2026-01-12T12:00:00Z',
            ],
            [
                'slug' => 'locatour_hq_cafe',
                'name' => 'Locatour HQ Cafe',
                'category' => 'food',
                'latitude' => -31.9530,
                'longitude' => 115.8570,
                'address' => '45 St Georges Terrace, Perth WA 6000',
                'points' => 150,
                'tier' => 1,
                'tags' => ['photography:cityscape'],
                'description' => 'Step into our cozy local cafe! Fuel up with premium coffee, enjoy hot bagels, and plan your next street exploration adventure.',
                'image_urls' => [
                    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
                    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=80',
                ],
                'verification_tags' => ['coffee', 'cafe', 'neon sign', 'espresso', 'barista'],
                'created_at' => '2026-01-15T12:00:00Z',
            ],
            [
                'slug' => 'st_georges_terrace',
                'name' => "St George's Terrace",
                'category' => 'scenic',
                'latitude' => -31.9567,
                'longitude' => 115.8598,
                'address' => 'St Georges Terrace, Perth WA 6000',
                'points' => 300,
                'tier' => 2,
                'tags' => ['photography:cityscape', 'cycling:road'],
                'description' => 'The architectural heart of the city. Look up at the high-rises and explore historical buildings tucked between modern skyscrapers.',
                'image_urls' => [
                    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80',
                ],
                'verification_tags' => ['skyscrapers', 'street', 'historic building', 'office'],
                'created_at' => '2026-02-01T12:00:00Z',
            ],
            [
                'slug' => 'hyde_park_lake',
                'name' => 'Hyde Park Lake',
                'category' => 'parks',
                'latitude' => -31.9392,
                'longitude' => 115.8624,
                'address' => 'Vincent St, Perth WA 6000',
                'points' => 300,
                'tier' => 2,
                'tags' => ['birdwatching:wetland', 'picnicking:shade', 'cycling:bike-path'],
                'description' => 'Hyde Park is a tranquil inner-city park featuring two lakes, giant plane trees, walking tracks, and active bird-watching points.',
                'image_urls' => [
                    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80',
                    'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80',
                ],
                'verification_tags' => ['lake', 'ducks', 'big trees', 'gazebos', 'pathway'],
                'created_at' => '2026-02-10T12:00:00Z',
            ],
        ];

        foreach ($locations as $location) {
            // "categorySlug:tagSlug" pairs — tag slugs are unique only within
            // a category, so we look them up scoped to the category.
            $tagKeys = $location['tags'] ?? [];
            unset($location['tags']);

            $record = Location::updateOrCreate(
                ['slug' => $location['slug']],
                // The original seeds are pre-approved and not attributed to a
                // contributor (submitted_by stays null).
                array_merge($location, [
                    'status' => Location::STATUS_APPROVED,
                    'submitted_by' => null,
                ])
            );

            $tagIds = collect($tagKeys)
                ->map(function (string $key): ?int {
                    [$categorySlug, $tagSlug] = explode(':', $key, 2);

                    return Tag::whereHas('category', fn ($q) => $q->where('slug', $categorySlug))
                        ->where('slug', $tagSlug)
                        ->value('id');
                })
                ->filter()
                ->all();

            $record->tags()->sync($tagIds);
        }
    }
}
