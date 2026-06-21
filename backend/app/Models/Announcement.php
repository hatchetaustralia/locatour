<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A broadcast message shown to app users (a banner). Only ONE announcement is
 * "live" at a time: activating one deactivates the rest (see booted()). The app
 * fetches Announcement::current() and shows it until dismissed.
 */
class Announcement extends Model
{
    public const LEVEL_INFO = 'info';

    public const LEVEL_SUCCESS = 'success';

    public const LEVEL_WARNING = 'warning';

    public const LEVELS = [
        self::LEVEL_INFO => 'Info',
        self::LEVEL_SUCCESS => 'Success',
        self::LEVEL_WARNING => 'Warning',
    ];

    protected $fillable = [
        'title',
        'body',
        'level',
        'is_active',
        'starts_at',
        'ends_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        // Enforce a single active announcement: whenever one is saved active, flip
        // every other row off. Uses a query update (not a model save) so it does
        // not re-fire this hook / recurse.
        static::saved(function (self $announcement): void {
            if ($announcement->is_active) {
                static::query()
                    ->whereKeyNot($announcement->getKey())
                    ->where('is_active', true)
                    ->update(['is_active' => false]);
            }
        });
    }

    /** Active AND within its (optional) schedule window right now. */
    public function scopeLive(Builder $query): Builder
    {
        $now = now();

        return $query
            ->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now));
    }

    /** The single announcement the app should show right now, or null. */
    public static function current(): ?self
    {
        return static::query()->live()->latest('updated_at')->first();
    }
}
