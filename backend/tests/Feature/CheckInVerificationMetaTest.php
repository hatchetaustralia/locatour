<?php

namespace Tests\Feature;

use App\Models\AppCheckIn;
use App\Models\AppUser;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verification metadata recorded with a check-in: GPS accuracy + camera EXIF
 * persist through the API, and the model derives the distance from the pinned
 * location (matched on slug). These feed the admin "View" detail panel.
 */
class CheckInVerificationMetaTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_persists_gps_accuracy_and_decoded_exif(): void
    {
        $user = AppUser::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/checkins', [
                'location_id' => 'kings_park',
                'location_name' => 'Kings Park',
                'points_earned' => 100,
                'latitude' => -31.9601,
                'longitude' => 115.8412,
                'gps_accuracy' => 4.5,
                'photo_exif' => json_encode(['Make' => 'Apple', 'Model' => 'iPhone 15']),
                'checked_in_at' => now()->toIso8601String(),
            ])
            ->assertStatus(201);

        $checkIn = AppCheckIn::firstOrFail();
        $this->assertSame(4.5, $checkIn->gps_accuracy);
        $this->assertSame(['Make' => 'Apple', 'Model' => 'iPhone 15'], $checkIn->photo_exif);
    }

    public function test_invalid_exif_json_is_ignored_not_fatal(): void
    {
        $user = AppUser::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/checkins', [
                'location_id' => 'kings_park',
                'photo_exif' => 'not-json',
            ])
            ->assertStatus(201);

        $this->assertNull(AppCheckIn::firstOrFail()->photo_exif);
    }

    public function test_distance_meters_is_derived_from_matched_location(): void
    {
        $user = AppUser::factory()->create();

        Location::create([
            'slug' => 'kings_park',
            'name' => 'Kings Park',
            'category' => 'parks',
            'latitude' => -31.9601,
            'longitude' => 115.8412,
            'address' => 'Perth WA',
            'points' => 100,
        ]);

        // ~157 m due north of the pin.
        $checkIn = AppCheckIn::create([
            'app_user_id' => $user->id,
            'location_id' => 'kings_park',
            'points_earned' => 100,
            'latitude' => -31.9587,
            'longitude' => 115.8412,
            'verified_offline' => false,
            'checked_in_at' => now(),
        ]);

        $this->assertNotNull($checkIn->distance_meters);
        $this->assertEqualsWithDelta(156, $checkIn->distance_meters, 10);
    }

    public function test_distance_meters_null_when_location_missing(): void
    {
        $user = AppUser::factory()->create();

        $checkIn = AppCheckIn::create([
            'app_user_id' => $user->id,
            'location_id' => 'ghost_spot',
            'points_earned' => 0,
            'latitude' => -31.95,
            'longitude' => 115.86,
            'verified_offline' => false,
            'checked_in_at' => now(),
        ]);

        $this->assertNull($checkIn->distance_meters);
    }
}
