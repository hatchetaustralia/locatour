<?php

namespace App\Http\Controllers;

use App\Models\AppCheckIn;
use Illuminate\Http\JsonResponse;
use Illuminate\View\View;

/**
 * Public, no-auth pages for externally shared check-ins. The token is an
 * unguessable random string (not the numeric id), so only people with the link
 * can view it, and the user can revoke it by rotating the token.
 */
class ShareController extends Controller
{
    /** GET /c/{token} — the shareable check-in card (with OG/Twitter meta). */
    public function show(string $token): View
    {
        $checkIn = AppCheckIn::with('appUser')
            ->where('share_token', $token)
            ->firstOrFail();

        return view('share.checkin', ['checkIn' => $checkIn]);
    }

    /**
     * GET /api/share/{token} — public JSON for a standalone share front-end (e.g.
     * a Next.js app that renders the page + OG tags itself). 404 if unknown/revoked.
     */
    public function data(string $token): JsonResponse
    {
        $checkIn = AppCheckIn::with('appUser')
            ->where('share_token', $token)
            ->firstOrFail();

        return response()->json([
            'location_name' => $checkIn->location_name,
            'photo_url' => $checkIn->photo_url,
            'points_earned' => $checkIn->points_earned,
            'checked_in_at' => optional($checkIn->checked_in_at)->toIso8601String(),
            'explorer' => $checkIn->appUser?->display_name
                ?: ($checkIn->appUser?->username ?: 'An explorer'),
            'share_url' => $checkIn->share_url,
        ]);
    }
}
