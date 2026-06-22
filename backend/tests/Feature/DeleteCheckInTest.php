<?php

namespace Tests\Feature;

use App\Models\AppCheckIn;
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
}
