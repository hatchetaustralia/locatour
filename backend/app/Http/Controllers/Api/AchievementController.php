<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AchievementResource;
use App\Models\Achievement;

class AchievementController extends Controller
{
    /**
     * GET /api/achievements
     * The active achievement catalogue (the app evaluates these against the
     * user's stats locally and shows them on the profile).
     */
    public function index()
    {
        $achievements = Achievement::query()
            ->where('is_active', true)
            ->orderBy('sort')
            ->orderBy('threshold')
            ->get();

        return AchievementResource::collection($achievements);
    }
}
