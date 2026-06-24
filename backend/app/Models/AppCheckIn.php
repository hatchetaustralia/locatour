<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

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
        'share_token',
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

    /** Clean the uploaded photo off the public disk whenever a check-in is
     *  deleted (admin "Revoke", the API destroy, or a cascade). No-op if none. */
    protected static function booted(): void
    {
        static::deleting(function (AppCheckIn $checkIn): void {
            if ($checkIn->photo_path) {
                Storage::disk('public')->delete($checkIn->photo_path);
            }
        });
    }

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

    /**
     * Mint (once) + return the unguessable public share token. Lazy so a check-in
     * stays private until the user explicitly taps Share.
     */
    public function ensureShareToken(): string
    {
        if (! $this->share_token) {
            $this->share_token = Str::random(16);
            $this->save();
        }

        return $this->share_token;
    }

    /**
     * Base for public share links: a standalone front-end (SHARE_BASE_URL, e.g. a
     * Next.js app) if set, else this app's own /c page.
     */
    public static function shareBaseUrl(): string
    {
        return rtrim(config('app.share_base_url') ?: url('/c'), '/');
    }

    /** Public share URL once a token exists, else null. */
    public function getShareUrlAttribute(): ?string
    {
        return $this->share_token ? self::shareBaseUrl().'/'.$this->share_token : null;
    }
}
