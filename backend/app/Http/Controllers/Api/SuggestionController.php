<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppUser;
use App\Models\LocationSuggestion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Handles app-user community location suggestions submitted from the map.
 *
 * A proximity check (haversine <= SUGGESTION_PROXIMITY_M) ensures the submitter
 * was physically on-site at the time of submission, preventing remote spam.
 */
class SuggestionController extends Controller
{
    /**
     * Maximum distance (metres) between the user's reported GPS position and the
     * suggested location. Tunable here without changing any other logic.
     */
    private const SUGGESTION_PROXIMITY_M = 150;

    /**
     * POST /api/suggestions  (auth:sanctum, EnsureAppUserNotBlocked)
     *
     * Validates proximity then creates a pending LocationSuggestion.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var AppUser $appUser */
        $appUser = $request->user();

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'notes' => ['nullable', 'string'],
            // User's current GPS position, required for the proximity gate.
            'user_lat' => ['required', 'numeric', 'between:-90,90'],
            'user_lng' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $distance = self::haversineMetres(
            (float) $data['user_lat'],
            (float) $data['user_lng'],
            (float) $data['latitude'],
            (float) $data['longitude'],
        );

        if ($distance > self::SUGGESTION_PROXIMITY_M) {
            return response()->json([
                'message' => sprintf(
                    'You must be within %d metres of the suggested location to submit it (you are approximately %d metres away).',
                    self::SUGGESTION_PROXIMITY_M,
                    (int) round($distance),
                ),
            ], 422);
        }

        $suggestion = LocationSuggestion::create([
            'app_user_id' => $appUser->id,
            'name' => $data['name'] ?? null,
            'latitude' => $data['latitude'],
            'longitude' => $data['longitude'],
            'notes' => $data['notes'] ?? null,
            'status' => LocationSuggestion::STATUS_PENDING,
        ]);

        return response()->json(['suggestion' => $suggestion], 201);
    }

    /**
     * Great-circle distance between two lat/lng points in metres (Haversine).
     * Mirrors LocationController::haversineMetres — kept private here so each
     * controller is self-contained without a shared utility class.
     */
    private static function haversineMetres(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371000; // metres

        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
