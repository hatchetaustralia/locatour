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
        'gps_accuracy',
        'photo_exif',
        'verified_offline',
        'checked_in_at',
    ];

    protected $casts = [
        'points_earned' => 'integer',
        'latitude' => 'float',
        'longitude' => 'float',
        'gps_accuracy' => 'float',
        'photo_exif' => 'array',
        'verified_offline' => 'boolean',
        'checked_in_at' => 'datetime',
    ];

    /** Surface the resolved photo URL on every serialised check-in. */
    protected $appends = ['photo_url'];

    /** Side effects whenever a check-in is deleted (admin "Revoke", the API
     *  destroy, or a cascade): clean its photo off the public disk, and fully
     *  undo the discovery by dropping the matching unlock — UNLESS another
     *  check-in still vouches for that location. Mirrored on the client by the
     *  authoritative resync on app open, so a revoke un-reveals the spot there too. */
    protected static function booted(): void
    {
        static::deleting(function (AppCheckIn $checkIn): void {
            if ($checkIn->photo_path) {
                Storage::disk('public')->delete($checkIn->photo_path);
            }

            $stillVouched = static::where('app_user_id', $checkIn->app_user_id)
                ->where('location_id', $checkIn->location_id)
                ->whereKeyNot($checkIn->getKey())
                ->exists();

            if (! $stillVouched) {
                AppUnlockedLocation::where('app_user_id', $checkIn->app_user_id)
                    ->where('location_id', $checkIn->location_id)
                    ->delete();
            }
        });
    }

    /** The app user who made this check-in. */
    public function appUser(): BelongsTo
    {
        return $this->belongsTo(AppUser::class);
    }

    /**
     * The location this check-in targeted, matched on the app slug
     * (location_id ↔ locations.slug — see the create migration's note). May be
     * null if the location has since been removed.
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'location_id', 'slug');
    }

    /**
     * Straight-line distance, in METRES, between the device coordinates recorded
     * at check-in and the location's pinned coordinates — the key signal for
     * vetting a check-in. Null when either side has no coordinates. Haversine.
     */
    public function getDistanceMetersAttribute(): ?int
    {
        $loc = $this->location;

        if ($this->latitude === null || $this->longitude === null
            || ! $loc || $loc->latitude === null || $loc->longitude === null) {
            return null;
        }

        $earthRadius = 6_371_000; // metres
        $latFrom = deg2rad((float) $this->latitude);
        $latTo = deg2rad((float) $loc->latitude);
        $latDelta = deg2rad((float) $loc->latitude - (float) $this->latitude);
        $lngDelta = deg2rad((float) $loc->longitude - (float) $this->longitude);

        $a = sin($latDelta / 2) ** 2
            + cos($latFrom) * cos($latTo) * sin($lngDelta / 2) ** 2;

        return (int) round($earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a)));
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
