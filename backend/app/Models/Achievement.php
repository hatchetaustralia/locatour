<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A tiered, machine-evaluable achievement (spec 08). The app reads these from
 * /api/achievements and awards any whose `metric` >= `threshold` for the user.
 */
class Achievement extends Model
{
    /** The difficulty tiers, in order, with their canonical point rewards. */
    public const DIFFICULTIES = [
        'Easy' => 25,
        'Medium' => 50,
        'Hard' => 100,
        'Elite' => 200,
        'Master' => 400,
        'Grandmaster' => 750,
    ];

    /** The metrics a rule may evaluate (must match the app's evaluator). */
    public const METRICS = [
        'total_checkins' => 'Total check-ins',
        'unique_locations' => 'Unique locations',
        'day_streak' => 'Day streak',
        'total_xp' => 'Total XP',
        'level' => 'Level reached',
        'tier_reached' => 'Highest tier reached',
        'distinct_categories' => 'Distinct categories visited',
        'checkins_in_day' => 'Check-ins in a single day',
        'category_checkins_parks' => 'Parks check-ins',
        'category_checkins_scenic' => 'Scenic check-ins',
        'category_checkins_food' => 'Food check-ins',
    ];

    protected $fillable = [
        'key', 'title', 'description', 'difficulty', 'category',
        'metric', 'threshold', 'points', 'icon_name', 'is_active', 'sort',
    ];

    protected $casts = [
        'threshold' => 'integer',
        'points' => 'integer',
        'sort' => 'integer',
        'is_active' => 'boolean',
    ];
}
