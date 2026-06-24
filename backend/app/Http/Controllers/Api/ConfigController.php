<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;

/**
 * Public read-only endpoint the app polls (e.g. on launch) for server-controlled
 * tunables (radii, multipliers, cooldowns). Same pull model as the announcement
 * API — the admin manages values in Filament; the app fetches the current set.
 *
 * Keys are camelCase apiField names (see Setting::API_FIELDS) so the response is
 * a drop-in config object for the mobile client.
 */
class ConfigController extends Controller
{
    /** GET /api/config  (public) — { apiField => castValue } for all settings. */
    public function index(): JsonResponse
    {
        return response()->json(Setting::apiPayload());
    }
}
