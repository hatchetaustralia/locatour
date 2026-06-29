<?php

namespace Tests\Feature;

use App\Models\AppCheckIn;
use App\Models\AppUnlockedLocation;
use App\Models\AppUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * DELETE /api/checkins/{checkIn} — owner-only check-in deletion.
 *
 * The owner may delete their own check-in (check-in row is removed).
 * A different authenticated user receives 403.
 */
class DeleteCheckInTest extends TestCase
{
    use RefreshDatabase;

    private function makeUserWithToken(): array
    {
        $user  = AppUser::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        return [$user, $token];
    }

    private function makeCheckIn(AppUser $user): AppCheckIn
    {
        return AppCheckIn::create([
            'app_user_id'   => $user->id,
            'location_id'   => 'test_location',
            'location_name' => 'Test Location',
            'points_earned' => 100,
            'photo_path'    => null,
            'latitude'      => -31.95,
            'longitude'     => 115.86,
            'verified_offline' => false,
            'checked_in_at' => now(),
        ]);
    }

    public function test_owner_can_delete_own_check_in(): void
    {
        [$user, $token] = $this->makeUserWithToken();
        $checkIn = $this->makeCheckIn($user);

        $this->withToken($token)
            ->deleteJson("/api/checkins/{$checkIn->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('app_check_ins', ['id' => $checkIn->id]);
    }

    public function test_non_owner_gets_403(): void
    {
        [$owner]        = $this->makeUserWithToken();
        [, $otherToken] = $this->makeUserWithToken();

        $checkIn = $this->makeCheckIn($owner);

        $this->withToken($otherToken)
            ->deleteJson("/api/checkins/{$checkIn->id}")
            ->assertStatus(403);

        // Row must still exist.
        $this->assertDatabaseHas('app_check_ins', ['id' => $checkIn->id]);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        [$owner] = $this->makeUserWithToken();
        $checkIn = $this->makeCheckIn($owner);

        $this->deleteJson("/api/checkins/{$checkIn->id}")
            ->assertStatus(401);
    }

    public function test_deleting_check_in_removes_the_unlock_when_no_other_remains(): void
    {
        [$user, $token] = $this->makeUserWithToken();
        $checkIn = $this->makeCheckIn($user);
        AppUnlockedLocation::create([
            'app_user_id' => $user->id,
            'location_id' => $checkIn->location_id,
        ]);

        $this->withToken($token)
            ->deleteJson("/api/checkins/{$checkIn->id}")
            ->assertStatus(204);

        // The spot is fully un-discovered.
        $this->assertDatabaseMissing('app_unlocked_locations', [
            'app_user_id' => $user->id,
            'location_id' => $checkIn->location_id,
        ]);
    }

    public function test_deleting_one_of_two_check_ins_keeps_the_unlock(): void
    {
        [$user, $token] = $this->makeUserWithToken();
        $first = $this->makeCheckIn($user);
        $second = $this->makeCheckIn($user); // same location_id
        AppUnlockedLocation::create([
            'app_user_id' => $user->id,
            'location_id' => $first->location_id,
        ]);

        $this->withToken($token)
            ->deleteJson("/api/checkins/{$first->id}")
            ->assertStatus(204);

        // A second check-in still vouches for the spot → unlock survives.
        $this->assertDatabaseHas('app_unlocked_locations', [
            'app_user_id' => $user->id,
            'location_id' => $first->location_id,
        ]);
    }
}
