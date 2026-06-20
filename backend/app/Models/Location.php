<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Location extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
    ];

    /**
     * Default XP reward per tier (1-10). An explicit lookup pinned to the
     * OSRS XP bands (NOT a smooth formula) per spec 06 §1. Changing a
     * location's tier in the admin auto-fills `points` with this default;
     * points then remain an editable override per location.
     *
     * @var array<int, int>
     */
    public const DEFAULT_POINTS_FOR_TIER = [
        1 => 100,
        2 => 200,
        3 => 350,
        4 => 700,
        5 => 1300,
        6 => 2300,
        7 => 4200,
        8 => 8000,
        9 => 14000,
        10 => 22000,
    ];

    /** Geofence radius bounds (metres) enforced by the form + API. */
    public const GEOFENCE_RADIUS_MIN = 50;

    public const GEOFENCE_RADIUS_MAX = 20000;

    /**
     * What each tier MEANS. Tier is a protection / carrying-capacity gate, not a
     * quality rating (spec 07): robust, well-serviced, already-famous places sit
     * low (everyone welcome, modest reward); fragile, facility-less, unpublicised
     * spots sit high (level-gated, so only invested explorers reach them, and they
     * earn the big rewards). Shown live next to the points slider.
     *
     * @var array<int, string>
     */
    public const TIER_DESCRIPTIONS = [
        1 => 'Open & robust — full facilities, built for crowds, already well-known. Everyone welcome.',
        2 => 'Popular & serviced — well-known, good facilities, comfortably handles volume.',
        3 => 'Established local — basic facilities, locally known.',
        4 => 'Lesser-known — takes some seeking out; limited facilities.',
        5 => 'Quiet & light-facility — sensitive to overuse; some effort to reach.',
        6 => 'Off the beaten track — minimal facilities; should stay low-traffic.',
        7 => 'Fragile / remote — sensitive or hard-to-reach; can\'t absorb crowds.',
        8 => 'Hidden gem — unpublicised, no facilities; protected by obscurity + the level gate.',
        9 => 'Delicate & secret — pristine or highly sensitive; seasoned, trusted explorers only.',
        10 => 'Sacred / bucket-list — the rarest, most fragile or significant places. Maximum protection & reward.',
    ];

    /**
     * The default points reward for a given tier (1-10). Falls back to the
     * tier-1 default for out-of-range input so callers never get null.
     */
    public static function defaultPointsForTier(int $tier): int
    {
        return self::DEFAULT_POINTS_FOR_TIER[$tier] ?? self::DEFAULT_POINTS_FOR_TIER[1];
    }

    /**
     * The maximum points value the tier bands cover (tier 10 threshold). The
     * admin points slider runs 0..this.
     */
    public static function maxTierPoints(): int
    {
        return self::DEFAULT_POINTS_FOR_TIER[10];
    }

    /**
     * Derive the tier (1-10) for a points value — the inverse of the bands.
     * The highest band whose threshold is <= points wins; below tier 1's
     * threshold still maps to tier 1 (never null/0).
     */
    public static function tierForPoints(int $points): int
    {
        $tier = 1;
        foreach (self::DEFAULT_POINTS_FOR_TIER as $t => $threshold) {
            if ($points >= $threshold) {
                $tier = $t;
            }
        }

        return $tier;
    }

    /** Human description of what a tier represents (see TIER_DESCRIPTIONS). */
    public static function tierDescription(int $tier): string
    {
        return self::TIER_DESCRIPTIONS[$tier] ?? self::TIER_DESCRIPTIONS[1];
    }

    /**
     * Tier is derived from points (points is the single source of truth), so
     * recompute it on every save regardless of how the row was written (form,
     * API, seeder).
     */
    protected static function booted(): void
    {
        static::saving(function (self $location): void {
            $location->tier = self::tierForPoints((int) $location->points);

            // Stamp when Google data was first attached (cheap re-sync marker).
            if ($location->place_id && empty($location->place_synced_at)) {
                $location->place_synced_at = now();
            }
        });
    }

    protected $fillable = [
        'slug',
        'name',
        'category',
        'latitude',
        'longitude',
        'address',
        'points',
        'tier',
        'tier_rationale',
        'description',
        'image_urls',
        'verification_tags',
        'geofence_radius_m',
        'active',
        'status',
        'submitted_by',
        // Visitor meta (spec 07).
        'accessibility',
        'amenities',
        'opening_hours',
        'dog_friendly',
        'family_friendly',
        // Google Places (New) sourced public info.
        'place_id',
        'place_synced_at',
        'directions_uri',
        'plus_code',
        'website_uri',
        'phone',
        'google_rating',
        'google_rating_count',
        'price_level',
        'business_status',
        'primary_type',
        'primary_type_label',
        'viewport',
    ];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'points' => 'integer',
        'tier' => 'integer',
        'image_urls' => 'array',
        'verification_tags' => 'array',
        'geofence_radius_m' => 'integer',
        'active' => 'boolean',
        // Visitor meta.
        'accessibility' => 'array',
        'amenities' => 'array',
        'opening_hours' => 'array',
        'dog_friendly' => 'boolean',
        'family_friendly' => 'boolean',
        // Places-sourced.
        'place_synced_at' => 'datetime',
        'google_rating' => 'decimal:1',
        'google_rating_count' => 'integer',
        'viewport' => 'array',
    ];

    /**
     * The user who submitted this location (null for the original seeds /
     * admin-created records).
     */
    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    /**
     * Tags applied to this location. The location's categories are derived
     * from the distinct categories of these tags (see LocationResource API).
     */
    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class);
    }

    /**
     * Only locations that have been approved (what the public API exposes).
     */
    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_APPROVED);
    }
}
