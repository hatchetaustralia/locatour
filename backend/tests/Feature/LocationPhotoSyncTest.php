<?php

namespace Tests\Feature;

use App\Filament\Resources\Locations\Pages\EditLocation;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guards the data-integrity behaviour of the location editor:
 *  - points are stored as whole integers (Location::saving rounds, not truncates);
 *  - a "Sync from Google Places" run folds the downloaded photos into the real
 *    image gallery (image_urls), de-duped and idempotent across re-syncs.
 *
 * The full Livewire page lifecycle (the edit-form save that preserves remote
 * seed images, and afterSave folding photos in) is exercised manually; here we
 * cover the underlying logic directly so it stays green in the sqlite CI suite.
 */
class LocationPhotoSyncTest extends TestCase
{
    use RefreshDatabase;

    private function makeLocation(array $overrides = []): Location
    {
        return Location::create(array_merge([
            'slug' => 'spot_'.uniqid(),
            'name' => 'Test Spot',
            'category' => 'parks',
            'latitude' => -31.9,
            'longitude' => 115.8,
            'address' => 'Somewhere, WA',
            'points' => 100,
            'geofence_radius_m' => 50,
        ], $overrides));
    }

    /** Invoke the page's protected persistPlacesPhotos() with a set of photo URLs. */
    private function persistPhotos(Location $location, array $photos): void
    {
        $page = new EditLocation;

        $photosProp = new \ReflectionProperty(EditLocation::class, 'pendingPlacesPhotos');
        $photosProp->setValue($page, $photos);

        $method = new \ReflectionMethod(EditLocation::class, 'persistPlacesPhotos');
        $method->invoke($page, $location);
    }

    public function test_points_saved_as_whole_integer(): void
    {
        $location = $this->makeLocation();
        $location->points = 299.99999999999994;
        $location->save();

        $this->assertSame(300, (int) $location->fresh()->getRawOriginal('points'));
    }

    public function test_synced_photos_are_appended_to_image_urls(): void
    {
        $location = $this->makeLocation(['image_urls' => ['https://images.example/seed.jpg']]);

        $this->persistPhotos($location, ['https://r2.example/p/0.jpg', 'https://r2.example/p/1.jpg']);

        $images = $location->fresh()->image_urls;
        $this->assertSame([
            'https://images.example/seed.jpg',
            'https://r2.example/p/0.jpg',
            'https://r2.example/p/1.jpg',
        ], $images);
    }

    public function test_resync_does_not_duplicate_photos(): void
    {
        $location = $this->makeLocation([
            'image_urls' => ['https://r2.example/p/0.jpg', 'https://r2.example/p/1.jpg'],
        ]);

        // Same stable URLs as already present → no change, no duplicates.
        $this->persistPhotos($location, ['https://r2.example/p/0.jpg', 'https://r2.example/p/1.jpg']);

        $this->assertCount(2, $location->fresh()->image_urls);
    }
}
