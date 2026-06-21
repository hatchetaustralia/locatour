<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * A single check-in by an AppUser, with an optional uploaded photo stored on
 * the public disk. Exposes a derived `photo_url` for the admin + API.
 */
class AppCheckIn extends Model
{
    use HasFactory;

    protected $fillable = [
        'app_user_id',
        'location_id',
        'location_name',
        'points_earned',
        'photo_path',
        'latitude',
        'longitude',
        'verified_offline',
        'checked_in_at',
    ];

    protected $casts = [
        'points_earned' => 'integer',
        'verified_offline' => 'boolean',
        'checked_in_at' => 'datetime',
    ];

    /** Surface the resolved photo URL on every serialised check-in. */
    protected $appends = ['photo_url'];

    /** The app user who made this check-in. */
    public function appUser(): BelongsTo
    {
        return $this->belongsTo(AppUser::class);
    }

    /** Public URL for the uploaded photo, or null when none was uploaded. */
    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path
            ? Storage::disk('public')->url($this->photo_path)
            : null;
    }
}
