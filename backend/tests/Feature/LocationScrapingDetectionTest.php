<?php

namespace Tests\Feature;

use App\Http\Middleware\MonitorLocationQueries;
use App\Models\AccountFlag;
use App\Models\AppUser;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Volume-based scrape detection. The MonitorLocationQueries middleware counts an
 * account's location queries within a rolling window; crossing FLAG_THRESHOLD
 * raises an (unblocked) flag and crossing BLOCK_THRESHOLD also auto-blocks.
 * Implied GPS speed is NOT used (the request lat/lng is the map-view centre, so
 * panning to another city is normal, not "teleporting").
 *
 * To avoid firing thousands of real requests, tests pre-seed
 * suspicious_query_count just below a threshold (with the window active) and then
 * drive a single request across it.
 *
 * Auth: a real Sanctum token sent as a Bearer header, with forgetGuards() before
 * each request so the token guard resolves the AppUser fresh from the DB (rather
 * than a stale in-memory model) and sees the counter we set via direct updates.
 */
class LocationScrapingDetectionTest extends TestCase
{
    use RefreshDatabase;

    private AppUser $user;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = AppUser::factory()->create();
        $this->token = $this->user->createToken('test')->plainTextToken;
    }

    /** Fire one authenticated location query, resolving the guard fresh. */
    private function query(float $lat = -31.95, float $lng = 115.86): void
    {
        $this->app['auth']->forgetGuards();

        $this->withToken($this->token)
            ->getJson("/api/locations?lat={$lat}&lng={$lng}")
            ->assertSuccessful();
    }

    /** Pre-seed the in-window query count with the window currently active. */
    private function primeWindow(int $count): void
    {
        AppUser::where('id', $this->user->id)->update([
            'last_location_query_at' => now()->subMinute(), // window active (< 1h)
            'suspicious_query_count' => $count,
        ]);
    }

    public function test_egregious_volume_flags_and_auto_blocks(): void
    {
        $this->primeWindow(MonitorLocationQueries::BLOCK_THRESHOLD - 1);
        $this->query();

        $this->user->refresh();

        $flag = AccountFlag::where('app_user_id', $this->user->id)
            ->where('type', AccountFlag::TYPE_SCRAPING)
            ->first();

        $this->assertNotNull($flag, 'A TYPE_SCRAPING flag must be created');
        $this->assertNull($flag->resolved_at);
        $this->assertArrayHasKey('queries_in_window', $flag->details);
        $this->assertSame(AppUser::STATUS_BLOCKED, $this->user->status, 'Egregious volume must auto-block');
        $this->assertTrue($this->user->isFlagged());
    }

    public function test_moderate_volume_flags_without_blocking(): void
    {
        $this->primeWindow(MonitorLocationQueries::FLAG_THRESHOLD - 1);
        $this->query();

        $this->user->refresh();

        $this->assertTrue($this->user->isFlagged(), 'Moderate volume must flag for review');
        $this->assertSame(AppUser::STATUS_ACTIVE, $this->user->status, 'Moderate volume must NOT block');
    }

    public function test_escalates_from_flag_to_block_without_duplicating(): void
    {
        // Flag first (no block).
        $this->primeWindow(MonitorLocationQueries::FLAG_THRESHOLD - 1);
        $this->query();
        $this->user->refresh();
        $this->assertTrue($this->user->isFlagged());
        $this->assertSame(AppUser::STATUS_ACTIVE, $this->user->status);

        // Volume climbs to the block threshold — same single flag, now blocked.
        $this->primeWindow(MonitorLocationQueries::BLOCK_THRESHOLD - 1);
        $this->query();
        $this->user->refresh();

        $this->assertSame(AppUser::STATUS_BLOCKED, $this->user->status);
        $this->assertSame(
            1,
            AccountFlag::where('app_user_id', $this->user->id)
                ->where('type', AccountFlag::TYPE_SCRAPING)
                ->whereNull('resolved_at')
                ->count(),
            'Escalation must not create a duplicate flag'
        );
    }

    public function test_expired_window_resets_count_so_volume_cannot_accumulate(): void
    {
        // A high count but the window expired (> 1h ago): the next query starts a
        // fresh window — a normal user can never drift into a block over time.
        AppUser::where('id', $this->user->id)->update([
            'last_location_query_at' => now()->subHours(2),
            'suspicious_query_count' => MonitorLocationQueries::BLOCK_THRESHOLD - 1,
        ]);

        $this->query();
        $this->user->refresh();

        $this->assertSame(1, $this->user->suspicious_query_count, 'Expired window must reset the count');
        $this->assertFalse($this->user->isFlagged());
        $this->assertSame(AppUser::STATUS_ACTIVE, $this->user->status);
    }

    public function test_normal_low_volume_does_not_flag_or_block(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $this->query(-31.95 + ($i * 0.001), 115.86);
        }

        $this->user->refresh();

        $this->assertFalse($this->user->isFlagged(), 'Normal browsing must not flag');
        $this->assertSame(AppUser::STATUS_ACTIVE, $this->user->status);
        $this->assertSame(0, AccountFlag::where('app_user_id', $this->user->id)->count());
    }

    public function test_resolving_flags_unblocks_and_resets_counter(): void
    {
        $this->primeWindow(MonitorLocationQueries::BLOCK_THRESHOLD - 1);
        $this->query();
        $this->user->refresh();
        $this->assertSame(AppUser::STATUS_BLOCKED, $this->user->status);

        // Simulate the admin "Resolve flags" action (resolve + unblock + reset).
        $admin = User::factory()->create(['is_super_admin' => true]);
        $this->user->activeFlags()->update(['resolved_at' => now(), 'resolved_by_id' => $admin->id]);
        $this->user->update([
            'status' => AppUser::STATUS_ACTIVE,
            'suspicious_query_count' => 0,
            'last_location_query_at' => null,
        ]);
        $this->user->refresh();

        $this->assertSame(AppUser::STATUS_ACTIVE, $this->user->status);
        $this->assertFalse($this->user->isFlagged());
        $this->assertSame(0, $this->user->suspicious_query_count);

        $resolved = AccountFlag::where('app_user_id', $this->user->id)->first();
        $this->assertNotNull($resolved->resolved_at);
        $this->assertSame($admin->id, $resolved->resolved_by_id);
    }

    public function test_unauthenticated_request_still_returns_data(): void
    {
        $this->getJson('/api/locations?lat=-31.95&lng=115.86&level=1')
            ->assertSuccessful()
            ->assertJsonStructure(['data']);
    }
}
