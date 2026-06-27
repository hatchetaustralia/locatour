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
}
