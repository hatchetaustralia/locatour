<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Laravel\Sanctum\HasApiTokens;

/**
 * A mobile-app end user (separate from the Filament admin `User`). This is the
 * Sanctum tokenable for the public app API. Keyed by `device_id` for Phase 1
 * lightweight auth; Phase 2 attaches Firebase OTP / SSO to the same row.
 */
class AppUser extends Model
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
    ];

    protected $casts = [
        'interests' => 'array',
        'total_xp' => 'integer',
        'current_level' => 'integer',
        'day_streak' => 'integer',
    ];

    /** Check-ins recorded by this app user. */
    public function checkIns(): HasMany
    {
        return $this->hasMany(AppCheckIn::class);
    }

    /** Whether this account has been blocked by an admin. */
    public function isBlocked(): bool
    {
        return $this->status === self::STATUS_BLOCKED;
    }
}
