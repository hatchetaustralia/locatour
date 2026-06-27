<?php

namespace App\Http\Middleware;

use App\Models\AppUser;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;

/**
 * Records `last_seen_at` for the authenticated app user on API activity.
 *
 * Throttled: only writes when last_seen_at is null or older than ~5 minutes, so
 * the common case (an active user hitting many endpoints) is NOT a DB write per
 * request. Applied after auth:sanctum on the app API routes. Uses a query-builder
 * update so it writes only `last_seen_at` — never bumps `updated_at` or fires
 * model events.
 */
class TouchAppUserLastSeen
{
    /** Minimum gap between last_seen_at writes, in seconds. */
    private const THROTTLE_SECONDS = 300;

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof AppUser) {
            $now = Carbon::now();
            $lastSeen = $user->last_seen_at;

            if ($lastSeen === null || $lastSeen->lte($now->copy()->subSeconds(self::THROTTLE_SECONDS))) {
                // Query-builder update: writes only last_seen_at (no updated_at, no
                // model events). Keep the in-memory model in sync so reads later in
                // the request see the fresh value.
                AppUser::whereKey($user->getKey())->update(['last_seen_at' => $now]);
                $user->last_seen_at = $now;
            }
        }

        return $next($request);
    }
}
