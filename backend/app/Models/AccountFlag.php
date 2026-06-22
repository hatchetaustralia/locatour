<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A typed, resolvable flag raised against an AppUser account.
 *
 * Flags are extensible by type: add a new TYPE_* constant here and call
 * $appUser->flagFor(AccountFlag::TYPE_NEW, 'reason', $details) in the
 * relevant detection code path. No schema changes required for new types.
 *
 * A flag is "active" (unresolved) while resolved_at is null.
 */
class AccountFlag extends Model
{
    /** Raised by MonitorLocationQueries when implausible query movement is detected. */
    public const TYPE_SCRAPING = 'scraping';

    /** Raised when an account repeatedly tries to change its base location during a cooldown. */
    public const TYPE_BASE_LOCATION_CHURN = 'base_location_churn';

    protected $fillable = [
        'app_user_id',
        'type',
        'reason',
        'details',
        'resolved_at',
        'resolved_by_id',
    ];

    protected $casts = [
        'details' => 'array',
        'resolved_at' => 'datetime',
    ];

    /** The app user this flag was raised against. */
    public function appUser(): BelongsTo
    {
        return $this->belongsTo(AppUser::class);
    }

    /** The admin who resolved this flag (null if still active). */
    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_id');
    }
}
