<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A hidden spot an AppUser has unlocked by reaching it. See the migration. */
class AppUnlockedLocation extends Model
{
    protected $fillable = ['app_user_id', 'location_id'];

    public function appUser(): BelongsTo
    {
        return $this->belongsTo(AppUser::class);
    }

    /**
     * The location this unlock refers to, matched on the app slug
     * (location_id ↔ locations.slug, the same join AppCheckIn uses). May be null
     * if the location has since been removed.
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'location_id', 'slug');
    }
}
