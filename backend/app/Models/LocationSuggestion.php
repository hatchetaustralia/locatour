<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A community location suggestion submitted by an app user from the map.
 *
 * Distinct from the admin contributor pending-location flow. The API enforces a
 * proximity check (haversine <= 150 m) before creating a suggestion so we know
 * the submitter was physically on-site.
 *
 * Lifecycle: pending → approved (Location created, converted_location_id set)
 *                    → rejected (review_notes required)
 */
class LocationSuggestion extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'app_user_id',
        'name',
        'latitude',
        'longitude',
        'notes',
        'status',
        'review_notes',
        'reviewed_by_id',
        'reviewed_at',
        'converted_location_id',
    ];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'reviewed_at' => 'datetime',
    ];

    /** The app user who submitted this suggestion. */
    public function appUser(): BelongsTo
    {
        return $this->belongsTo(AppUser::class);
    }

    /** The admin who reviewed this suggestion. */
    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_id');
    }

    /** The Location created when this suggestion was approved. */
    public function convertedLocation(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'converted_location_id');
    }

    /** Scope: suggestions awaiting review. */
    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PENDING);
    }
}
