<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * A mobile-app end user (separate from the Filament admin `User`). This is the
 * Sanctum tokenable for the public app API. Keyed by `device_id` for Phase 1
 * lightweight auth; Phase 2 attaches Firebase OTP / SSO to the same row.
 *
 * Extends Authenticatable (not plain Model) so Laravel's auth contracts are
 * satisfied — required for Sanctum's token guard and actingAs() in tests.
 */
class AppUser extends Authenticatable
{
    use HasApiTokens, HasFactory;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_BLOCKED = 'blocked';

    protected $fillable = [
        'device_id',
        'display_name',
        'username',
        'email',
        'phone',
        'bio',
        'avatar_url',
        'gender',
        'home_suburb',
        'interests',
        'total_xp',
        'current_level',
        'day_streak',
        'status',
        // Scrape detection (volume): last_location_query_at = the current
        // counting window's start; suspicious_query_count = queries in that window.
        'last_location_query_at',
        'suspicious_query_count',
    ];

    protected $casts = [
        'interests' => 'array',
        'total_xp' => 'integer',
        'current_level' => 'integer',
        'day_streak' => 'integer',
        'last_location_query_at' => 'datetime',
        'suspicious_query_count' => 'integer',
    ];

    /** Check-ins recorded by this app user. */
    public function checkIns(): HasMany
    {
        return $this->hasMany(AppCheckIn::class);
    }

    /** All flags raised against this account (resolved and unresolved). */
    public function accountFlags(): HasMany
    {
        return $this->hasMany(AccountFlag::class);
    }

    /**
     * Active (unresolved) flags — i.e. flags where resolved_at is null.
     * Use this relation when you need to eager-load or count active flags.
     */
    public function activeFlags(): HasMany
    {
        return $this->hasMany(AccountFlag::class)->whereNull('resolved_at');
    }

    /** Whether this account has been blocked by an admin. */
    public function isBlocked(): bool
    {
        return $this->status === self::STATUS_BLOCKED;
    }

    /**
     * Whether this account has any unresolved flag.
     * Queries the DB each call — use activeFlags()->exists() for eager checks.
     */
    public function isFlagged(): bool
    {
        return $this->activeFlags()->exists();
    }

    /** Scope: accounts that have at least one unresolved flag. */
    public function scopeFlagged(Builder $query): Builder
    {
        return $query->whereHas('activeFlags');
    }

    /**
     * Raise a typed flag against this account, optionally auto-blocking it.
     *
     * Idempotent on the FLAG: if an unresolved flag of the same $type already
     * exists, no duplicate row is created (rapid re-triggering of the detection
     * middleware is harmless). It will STILL escalate to a block when one is
     * requested and the account isn't already blocked — e.g. query volume climbs
     * from the flag threshold to the block threshold within the same window.
     *
     * @param  array<string, mixed>  $details  Structured context stored as JSON
     *                                         (e.g. ['queries_in_window' => 1200]).
     */
    public function flagFor(string $type, string $reason, array $details = [], bool $block = false): void
    {
        $alreadyFlagged = $this->activeFlags()->where('type', $type)->exists();

        if (! $alreadyFlagged) {
            $this->accountFlags()->create([
                'type' => $type,
                'reason' => $reason,
                'details' => $details ?: null,
            ]);
        }

        if ($block && ! $this->isBlocked()) {
            $this->update(['status' => self::STATUS_BLOCKED]);
        }
    }
}
