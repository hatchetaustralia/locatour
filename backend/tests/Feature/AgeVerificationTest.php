<?php

namespace Tests\Feature;

use App\Models\AppUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * POST /api/account/register — 13+ age verification.
 *
 * When date_of_birth is provided: users under 13 are rejected (422, no token,
 * no row created). Users aged 13+ are allowed through. When date_of_birth is
 * omitted entirely, legacy callers are not affected.
 */
class AgeVerificationTest extends TestCase
{
    use RefreshDatabase;

    private function register(array $overrides = [])
    {
        $base = [
            'device_id'    => 'device-test-' . uniqid(),
            'display_name' => 'Test User',
            'username'     => 'testuser' . uniqid(),
        ];

        return $this->postJson('/api/account/register', array_merge($base, $overrides));
    }

    public function test_register_with_dob_age_12_returns_422_no_token_no_user(): void
    {
        $dob = now()->subYears(12)->format('Y-m-d');

        $response = $this->register(['date_of_birth' => $dob]);

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Locatour is currently available for users aged 13 and above.');
        $this->assertArrayNotHasKey('token', $response->json());
        $this->assertDatabaseCount('app_users', 0);
    }

    public function test_register_with_dob_age_13_succeeds_with_token(): void
    {
        // Exactly 13 years ago today.
        $dob = now()->subYears(13)->format('Y-m-d');

        $response = $this->register(['date_of_birth' => $dob]);

        $response->assertSuccessful();
        $response->assertJsonStructure(['token', 'user']);
        $this->assertDatabaseCount('app_users', 1);
    }

    public function test_register_without_dob_still_works_for_legacy_callers(): void
    {
        $response = $this->register();

        $response->assertSuccessful();
        $response->assertJsonStructure(['token', 'user']);
    }

    public function test_register_with_dob_age_18_succeeds(): void
    {
        $dob = now()->subYears(18)->format('Y-m-d');

        $response = $this->register(['date_of_birth' => $dob]);

        $response->assertSuccessful();
        $response->assertJsonStructure(['token', 'user']);
    }
}
