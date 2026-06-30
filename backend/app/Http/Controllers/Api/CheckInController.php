<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppCheckIn;
use App\Models\AppUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
            // Horizontal accuracy of the GPS fix in metres (lower = better).
            'gps_accuracy' => ['nullable', 'numeric'],
            // Raw camera EXIF, sent as a JSON string over multipart (objects can't
            // ride in a form field). Decoded below; ignored if it isn't valid JSON.
            'photo_exif' => ['nullable', 'string'],
            'verified_offline' => ['nullable', 'boolean'],
            'checked_in_at' => ['nullable', 'date'],
            'photo' => ['nullable', 'image', 'max:10240'],
        ]);

        $photoExif = null;
        if (! empty($data['photo_exif'])) {
            $decoded = json_decode($data['photo_exif'], true);
            $photoExif = is_array($decoded) ? $decoded : null;
        }

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
            'gps_accuracy' => $data['gps_accuracy'] ?? null,
            'photo_exif' => $photoExif,
            'verified_offline' => $request->boolean('verified_offline'),
            'checked_in_at' => $data['checked_in_at'] ?? now(),
        ]);

        // A check-in implies the spot is unlocked — persist it so it restores on
        // sign-in / a new device (idempotent).
        $appUser->unlockedLocations()->firstOrCreate(['location_id' => $data['location_id']]);

        // total_xp is derived (sum of check-in points + bonus_xp): recompute now
        // so the new points are reflected server-side immediately.
        $appUser->recalcXp();

        return response()->json([
            'check_in' => $checkIn,
            'total_xp' => $appUser->total_xp,
            'current_level' => $appUser->current_level,
        ], 201);
    }

    /**
     * DELETE /api/checkins/{checkIn}  (auth:sanctum, EnsureAppUserNotBlocked)
     * Deletes the authenticated user's own check-in (403 if it belongs to another user).
     * Removes the photo from the public disk when one was uploaded.
     */
    public function destroy(Request $request, AppCheckIn $checkIn): JsonResponse
    {
        /** @var AppUser $appUser */
        $appUser = $request->user();

        if ($checkIn->app_user_id !== $appUser->id) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        if ($checkIn->photo_path) {
            Storage::disk('public')->delete($checkIn->photo_path);
        }

        $checkIn->delete();

        return response()->json(null, 204);
    }

    /**
     * POST /api/checkins/{checkIn}/share  (auth:sanctum, EnsureAppUserNotBlocked)
     * Mints (once) the check-in's public share token and returns the public URL
     * for the /c/{token} page. 403 if the check-in belongs to another user.
     */
    public function share(Request $request, AppCheckIn $checkIn): JsonResponse
    {
        /** @var AppUser $appUser */
        $appUser = $request->user();

        if ($checkIn->app_user_id !== $appUser->id) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $token = $checkIn->ensureShareToken();

        return response()->json([
            'token' => $token,
            'url' => $checkIn->share_url, // honours SHARE_BASE_URL (standalone front-end)
        ]);
    }
}
