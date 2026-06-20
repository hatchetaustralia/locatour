<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Tag;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class CategorySeeder extends Seeder
{
    /**
     * The 9 fixed categories = the app's profile interest ids/names, each
     * with its Ionicons icon, plus a handful of sample tags per category.
     * See docs/locatour/06-rich-locations-and-leveling-spec.md §2.
     *
     * @var array<string, array{name: string, icon: string, tags: array<int, string>}>
     */
    protected array $categories = [
        'hiking' => [
            'name' => 'Hiking',
            'icon' => 'trail-sign-outline',
            'tags' => ['Summit', 'Coastal Trail', 'Loop', 'Waterfall'],
        ],
        'camping' => [
            'name' => 'Camping',
            'icon' => 'bonfire-outline',
            'tags' => ['Campground', 'Free Camp', 'Caravan Friendly'],
        ],
        'fishing' => [
            'name' => 'Fishing',
            'icon' => 'water-outline',
            'tags' => ['Jetty', 'Beach Fishing', 'Estuary'],
        ],
        'kayaking' => [
            'name' => 'Kayaking',
            'icon' => 'boat-outline',
            'tags' => ['Flat Water', 'River Run', 'Boat Ramp'],
        ],
        'birdwatching' => [
            'name' => 'Birdwatching',
            'icon' => 'eye-outline',
            'tags' => ['Wetland', 'Hide', 'Migratory'],
        ],
        'photography' => [
            'name' => 'Photography',
            'icon' => 'camera-outline',
            'tags' => ['Sunset', 'Cityscape', 'Astro', 'Wildlife'],
        ],
        'cycling' => [
            'name' => 'Cycling',
            'icon' => 'bicycle-outline',
            'tags' => ['Bike Path', 'Mountain Bike', 'Road'],
        ],
        'picnicking' => [
            'name' => 'Picnicking',
            'icon' => 'pizza-outline',
            'tags' => ['BBQ', 'Shade', 'Playground'],
        ],
        'swimming' => [
            'name' => 'Swimming',
            'icon' => 'umbrella-outline',
            'tags' => ['Beach', 'Lake', 'Pool', 'Rock Pool'],
        ],
    ];

    public function run(): void
    {
        foreach ($this->categories as $slug => $data) {
            $category = Category::updateOrCreate(
                ['slug' => $slug],
                ['name' => $data['name'], 'icon' => $data['icon']],
            );

            foreach ($data['tags'] as $tagName) {
                Tag::updateOrCreate(
                    ['category_id' => $category->id, 'slug' => Str::slug($tagName)],
                    ['name' => $tagName],
                );
            }
        }
    }
}
