<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

/**
 * A creatable sub-label under a {@see Category} (e.g. Hiking -> "summit").
 * Locations are tagged with these; their categories are derived from the
 * distinct categories of their tags.
 */
class Tag extends Model
{
    protected $fillable = [
        'category_id',
        'name',
        'slug',
    ];

    protected static function booted(): void
    {
        // Auto-derive the slug from the name when one isn't provided (e.g. tags
        // created inline from the Filament createOptionForm).
        static::saving(function (Tag $tag): void {
            if (blank($tag->slug) && filled($tag->name)) {
                $tag->slug = Str::slug($tag->name);
            }
        });
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function locations(): BelongsToMany
    {
        return $this->belongsToMany(Location::class);
    }
}
