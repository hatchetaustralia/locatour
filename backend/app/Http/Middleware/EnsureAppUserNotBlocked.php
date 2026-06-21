<?php

namespace App\Http\Middleware;

use App\Models\AppUser;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses any authenticated app-user request from a blocked account with a 403.
 * Applied after auth:sanctum on the app API routes.
 */
class EnsureAppUserNotBlocked
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof AppUser && $user->isBlocked()) {
            return response()->json(['error' => 'account blocked'], 403);
        }

        return $next($request);
    }
}
