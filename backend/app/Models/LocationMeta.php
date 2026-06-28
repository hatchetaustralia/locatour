<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Full Google Places enrichment cache for a location (1:1 sidecar).
 *
 * Holds the complete raw Place Details response, the downloaded photo URLs, and
 * a `synced_at` marker, so the core locations row stays lean. See the
 * create_location_meta_table migration + Location::meta().
 */
class LocationMeta extends Model
{
    protected $table = 'location_meta';

    protected $fillable = [
        'location_id',
        'google_place_id',
        'rating',
        'user_ratings_total',
        'price_level',
        'business_status',
        'website',
        'phone',
        'opening_hours',
        'types',
        'editorial_summary',
        'photo_urls',
        'raw',
        'synced_at',
    ];

    protected $casts = [
        'rating' => 'decimal:1',
        'user_ratings_total' => 'integer',
        'price_level' => 'integer',
        'opening_hours' => 'array',
        'types' => 'array',
        'photo_urls' => 'array',
        'raw' => 'array',
        'synced_at' => 'datetime',
    ];

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }
}
