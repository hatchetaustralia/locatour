<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Records mobile-app check-ins (multipart, optional photo upload). Blocked
 * accounts are refused here as a defence-in-depth guard in addition to the
 * route middleware.
 */
class CheckInController extends Controller
{
    /**
     * POST /api/checkins  (auth:sanctum, multipart/form-data)
     * Stores an optional photo on the public disk and records the check-in.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var AppUser $appUser */
        $appUser = $request->user();

        if ($appUser->isBlocked()) {
            return response()->json(['error' => 'account blocked'], 403);
        }

        $data = $request->validate([
            'location_id' => ['required', 'string', 'max:255'],
            'location_name' => ['nullable', 'string', 'max:255'],
            'points_earned' => ['nullable', 'integer'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'verified_offline' => ['nullable', 'boolean'],
            'checked_in_at' => ['nullable', 'date'],
            'photo' => ['nullable', 'image', 'max:10240'],
        ]);

        $photoPath = null;
        if ($request->hasFile('photo')) {
            $photoPath = $request->file('photo')
                ->store('checkins/'.$appUser->id, 'public');
        }

        $checkIn = $appUser->checkIns()->create([
            'location_id' => $data['location_id'],
            'location_name' => $data['location_name'] ?? null,
            'points_earned' => $data['points_earned'] ?? 0,
            'photo_path' => $photoPath,
            'latitude' => $data['latitude'] ?? null,
            'longitude' => $data['longitude'] ?? null,
            'verified_offline' => $request->boolean('verified_offline'),
            'checked_in_at' => $data['checked_in_at'] ?? now(),
        ]);

        return response()->json([
            'check_in' => $checkIn,
        ], 201);
    }
}
