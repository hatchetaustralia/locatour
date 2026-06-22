<?php

namespace Tests\Feature;

use App\Models\AppUser;
use App\Models\LocationSuggestion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * POST /api/suggestions — community location suggestion submission.
 *
 * Proximity gate: the user must be within 150 m of the suggested location.
 * Suggestions created without violating the gate land in 'pending' status.
 */
class LocationSuggestionTest extends TestCase
{
    use RefreshDatabase;

    private AppUser $user;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user  = AppUser::factory()->create();
        $this->token = $this->user->createToken('test')->plainTextToken;
    }

    private function suggest(array $overrides = [])
    {
        $payload = array_merge([
            'name'      => 'Test Spot',
            'latitude'  => -31.9500,
            'longitude' => 115.8605,
            'notes'     => 'Nice place',
            // User is at the same coords — well within 150 m.
            'user_lat'  => -31.9500,
            'user_lng'  => 115.8605,
        ], $overrides);

        return $this->withToken($this->token)->postJson('/api/suggestions', $payload);
    }

    public function test_suggestion_within_radius_creates_pending_row(): void
    {
        $response = $this->suggest();

        $response->assertStatus(201);
        $response->assertJsonPath('suggestion.status', 'pending');

        $this->assertDatabaseHas('location_suggestions', [
            'app_user_id' => $this->user->id,
            'status'      => LocationSuggestion::STATUS_PENDING,
        ]);
    }

    public function test_suggestion_too_far_away_returns_422_and_no_row(): void
    {
        // Perth CBD is ~8 km from the suggested coords above — far outside 150 m.
        $response = $this->suggest([
            'user_lat' => -31.9505,
            'user_lng' => 115.8605,
            // Suggest a point ~200 m away (approx 0.002° latitude ≈ 222 m).
            'latitude'  => -31.9485,
            'longitude' => 115.8605,
        ]);

        $response->assertStatus(422);
        $response->assertJsonStructure(['message']);

        $this->assertDatabaseCount('location_suggestions', 0);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->postJson('/api/suggestions', [
            'latitude'  => -31.9500,
            'longitude' => 115.8605,
            'user_lat'  => -31.9500,
            'user_lng'  => 115.8605,
        ])->assertStatus(401);
    }
}
