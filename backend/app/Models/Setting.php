<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * A single server-controlled tunable value. Rows are seeded with defaults that
 * match the current hard-coded values, so reading a setting changes nothing
 * until an admin edits it in Filament.
 *
 * Reads go through a forever-cached key=>castvalue map (one query, then memory).
 * Any write (model save/delete, incl. via Filament) busts the cache via booted().
 */
class Setting extends Model
{
    /** Cache key for the whole settings map. */
    public const CACHE_KEY = 'locatour.settings';

    protected $fillable = [
        'key',
        'value',
        'type',
        'group',
        'label',
        'unit',
        'description',
        'min',
        'max',
        'sort',
    ];

    protected $casts = [
        'min' => 'integer',
        'max' => 'integer',
        'sort' => 'integer',
    ];

    /**
     * Maps each DB key to the camelCase API field the mobile app expects.
     * Single source of truth for GET /api/config's JSON keys. Kept in sync with
     * SettingSeeder's defaults.
     */
    public const API_FIELDS = [
        'hidden_radius_m' => 'hiddenRadiusM',
        'warm_radius_m' => 'warmRadiusM',
        'check_in_radius_m' => 'checkInRadiusM',
        'reveal_radius_m' => 'revealRadiusM',
        'vicinity_radius_m' => 'vicinityRadiusM',
        'reach_radius_m' => 'reachRadiusM',
        'default_search_radius_m' => 'defaultSearchRadiusM',
        'discovery_multiplier' => 'discoveryMultiplier',
        'nearby_alerts_multiplier' => 'nearbyAlertsMultiplier',
        'checkin_cooldown_h' => 'checkinCooldownH',
        'hidden_tier_range' => 'hiddenTierRange',
        'lock_teaser_range' => 'lockTeaserRange',
        'radius_tier_boost_pct' => 'radiusTierBoostPct',
    ];

    protected static function booted(): void
    {
        // Any write must bust the cached map so reads pick up the new value.
        static::saved(fn () => static::flushCache());
        static::deleted(fn () => static::flushCache());
    }

    /**
     * The forever-cached key => castvalue map (one query, then served from cache).
     *
     * @return array<string, int|float|null>
     */
    protected static function map(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, function (): array {
            return static::query()
                ->get(['key', 'value', 'type'])
                ->mapWithKeys(fn (self $s): array => [$s->key => $s->castValue()])
                ->all();
        });
    }

    /** Cast this row's raw string value to its declared type. */
    public function castValue(): int|float|null
    {
        if ($this->value === null) {
            return null;
        }

        return $this->type === 'float'
            ? (float) $this->value
            : (int) $this->value;
    }

    /**
     * Get a setting cast to its type, or $default if the key is missing/null.
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $map = static::map();

        return array_key_exists($key, $map) && $map[$key] !== null
            ? $map[$key]
            : $default;
    }

    /** Convenience: get a setting as an int (or the int $default). */
    public static function int(string $key, int $default = 0): int
    {
        return (int) static::get($key, $default);
    }

    /** Convenience: get a setting as a float (or the float $default). */
    public static function float(string $key, float $default = 0.0): float
    {
        return (float) static::get($key, $default);
    }

    /**
     * The full public config payload for GET /api/config: every setting keyed by
     * its camelCase apiField, value cast to its type.
     *
     * @return array<string, int|float|null>
     */
    public static function apiPayload(): array
    {
        $map = static::map();
        $payload = [];

        foreach (self::API_FIELDS as $key => $apiField) {
            $payload[$apiField] = $map[$key] ?? null;
        }

        return $payload;
    }

    /** Forget the cached settings map (called on every write). */
    public static function flushCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
