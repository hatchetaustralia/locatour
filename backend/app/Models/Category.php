<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One of the 9 fixed profile interests (hiking, camping, ...). Holds an
 * Ionicons `icon` name and groups the creatable {@see Tag}s beneath it.
 */
class Category extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'icon',
    ];

    public function tags(): HasMany
    {
        return $this->hasMany(Tag::class);
    }
}
