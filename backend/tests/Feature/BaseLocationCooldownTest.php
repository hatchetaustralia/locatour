<?php

namespace Tests\Feature;

use App\Models\AccountFlag;
use App\Models\AppUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Base-location changes are throttled server-side by an escalating, PIN-lockout
 * style cooldown (AccountController::baseLocation): the 1st change is free, then
 * a 24h lock, then a ~30-day lock for every change after that. Trying to change
 * while locked is rejected (429) and counts as an attempt; repeated attempts
 * raise a base_location_churn flag (no auto-ban — the cooldown is the gate).
 */
class BaseLocationCooldownTest extends TestCase
{
    use RefreshDatabase;

    private AppUser $user;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = AppUser::factory()->create([
            'home_suburb' => 'Yanchep WA',
            'home_lat' => -31.55,
            'home_lng' => 115.63,
            'home_change_count' => 0,
            'home_changed_at' => now()->subYear(),
        ]);
        $this->token = $this->user->createToken('test')->plainTextToken;
    }

    private function change(string $suburb, float $lat, float $lng)
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($this->token)->postJson('/api/account/base-location', [
            'home_suburb' => $suburb,
            'home_lat' => $lat,
            'home_lng' => $lng,
        ]);
    }

    public function test_first_change_is_allowed_then_locks_for_24h(): void
    {
        $this->change('Joondalup WA', -31.74, 115.77)->assertSuccessful();

        $this->user->refresh();
        $this->assertSame(1, $this->user->home_change_count);
        $this->assertEqualsWithDelta(-31.74, (float) $this->user->home_lat, 0.0001);

        // A second change immediately after is inside the 24h lock → 429.
        $this->change('Scarborough WA', -31.89, 115.76)
            ->assertStatus(429)
            ->assertJson(['error' => 'cooldown']);

        $this->user->refresh();
        $this->assertSame(1, $this->user->home_change_count, 'Rejected change must not apply');
        $this->assertSame(1, $this->user->home_change_attempts);
    }

    public function test_second_change_allowed_after_24h_then_locks_for_30d(): void
    {
        // Pretend the 1st change happened just over 24h ago.
        $this->user->update(['home_change_count' => 1, 'home_changed_at' => now()->subHours(25)]);

        $this->change('Fremantle WA', -32.05, 115.74)->assertSuccessful();
        $this->user->refresh();
        $this->assertSame(2, $this->user->home_change_count);

        // Now within the 30-day lock → next change rejected.
        $this->change('Cottesloe WA', -31.99, 115.75)->assertStatus(429);
    }

    public function test_repeated_attempts_during_cooldown_raise_a_flag_without_blocking(): void
    {
        // In an active 30-day lock (already 2 changes, changed recently).
        $this->user->update(['home_change_count' => 2, 'home_changed_at' => now()->subDay()]);

        for ($i = 0; $i < 3; $i++) {
            $this->change("Suburb {$i} WA", -32.0 - $i, 115.7)->assertStatus(429);
        }

        $this->user->refresh();
        $this->assertGreaterThanOrEqual(3, $this->user->home_change_attempts);
        $this->assertTrue(
            $this->user->activeFlags()->where('type', AccountFlag::TYPE_BASE_LOCATION_CHURN)->exists(),
            'Repeated churn must raise a base_location_churn flag'
        );
        // Flag only — never auto-blocked.
        $this->assertSame(AppUser::STATUS_ACTIVE, $this->user->status);
    }

    public function test_successful_change_resets_attempt_counter(): void
    {
        // One rejected attempt recorded, then the lock elapses and a real change lands.
        $this->user->update([
            'home_change_count' => 1,
            'home_changed_at' => now()->subHours(25),
            'home_change_attempts' => 2,
        ]);

        $this->change('Hillarys WA', -31.81, 115.74)->assertSuccessful();
        $this->user->refresh();
        $this->assertSame(0, $this->user->home_change_attempts);
    }

    public function test_sync_cannot_change_base_location(): void
    {
        $this->app['auth']->forgetGuards();

        $this->withToken($this->token)->postJson('/api/account/sync', [
            'display_name' => 'Same Name',
            'username' => $this->user->username,
            'home_suburb' => 'Sneaky Suburb WA',
            'home_lat' => 1.234,
            'home_lng' => 5.678,
        ])->assertSuccessful();

        $this->user->refresh();
        $this->assertSame('Yanchep WA', $this->user->home_suburb, 'sync must not move the base location');
        $this->assertEqualsWithDelta(-31.55, (float) $this->user->home_lat, 0.0001);
    }
}
