<?php

namespace App\Http\Middleware;

use App\Models\AccountFlag;
use App\Models\AppUser;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware: attribute location queries to authenticated AppUsers and flag (and,
 * at an egregious rate, auto-block) accounts whose query VOLUME indicates
 * automated scraping.
 *
 * Why volume, not speed: the lat/lng sent to /api/locations is the MAP-VIEW
 * CENTRE, not the device's GPS, so "implied travel speed between queries" is
 * meaningless — panning the map to another city is normal use, not teleporting.
 * The only honest signal here is how MANY queries an account makes: a human
 * browsing makes a handful per minute; a scraper sweeping a grid makes hundreds.
 *
 * Detection: a fixed rolling window (WINDOW_SECONDS) counts an account's
 * location queries. Crossing FLAG_THRESHOLD raises an (unblocked) flag for admin
 * review; crossing the much-higher BLOCK_THRESHOLD also auto-blocks. The window
 * resets once it expires, so a normal user's count can never accumulate toward a
 * block over time, and "Resolve flags" clears the counter so a reinstated user
 * starts clean.
 *
 * Attribution is OPTIONAL — requests without a Bearer token still pass through;
 * they just can't be attributed (the public route also has a per-IP throttle).
 * Entirely fail-soft: any exception is swallowed so it can NEVER break the API.
 *
 * NOTE: thresholds are starting points — review flagged accounts and tune. The
 * route's throttle (40/min) caps the reachable volume at ~2,400/window(hr).
 */
class MonitorLocationQueries
{
    /** Rolling counting window, in seconds (1 hour). */
    public const WINDOW_SECONDS = 3600;

    /**
     * Queries within a window above which the account is FLAGGED for review.
     * Only the located re-syncs hit the network — one when the home screen gets
     * its GPS fix, one when the map first centres — so an app open is ~2 calls
     * (3-4 if screens re-mount). Even someone reopening the app every few minutes
     * tops out around 10-40/hour. 50 sits just above the heaviest plausible human;
     * flagging is non-destructive (admin review only) so it can sit tight.
     */
    public const FLAG_THRESHOLD = 50;

    /**
     * Queries within a window above which the account is also AUTO-BLOCKED.
     * Auto-block is destructive, so this keeps a ~3-6x margin over the heaviest
     * plausible human use — only an automated client sustains this rate (a scraper
     * capped at the 40/min route limit still trips it in ~3 minutes).
     */
    public const BLOCK_THRESHOLD = 120;

    public function handle(Request $request, Closure $next): Response
    {
        // Run the request first so monitoring never delays the response.
        $response = $next($request);

        // All monitoring is fail-soft — never break the API response.
        try {
            $this->monitor($request);
        } catch (\Throwable) {
            // Silently swallow — monitoring must not affect the response.
        }

        return $response;
    }

    private function monitor(Request $request): void
    {
        // Only attribute to authenticated AppUsers (Bearer token present).
        $appUser = $request->user('sanctum');
        if (! $appUser instanceof AppUser) {
            return;
        }

        $now = now();
        $windowStart = $appUser->last_location_query_at; // reused as the window start

        if ($windowStart === null || $windowStart->diffInSeconds($now) > self::WINDOW_SECONDS) {
            // Window expired (or first ever query) — start a fresh window.
            $appUser->last_location_query_at = $now;
            $count = 1;
        } else {
            // Still inside the window — increment the running count.
            $count = ((int) $appUser->suspicious_query_count) + 1;
        }

        $appUser->suspicious_query_count = $count; // reused as the in-window query count
        $appUser->save();

        if ($count < self::FLAG_THRESHOLD) {
            return;
        }

        // Over the egregious threshold → flag AND block; otherwise flag for review
        // only. flagFor() is idempotent on the flag, but will escalate to a block
        // if one is requested and the account isn't already blocked.
        $block = $count >= self::BLOCK_THRESHOLD;
        $appUser->flagFor(
            AccountFlag::TYPE_SCRAPING,
            $block
                ? 'Excessive location-query volume — auto-blocked as likely API scraping'
                : 'Elevated location-query volume — flagged for review (possible scraping)',
            ['queries_in_window' => $count, 'window_minutes' => (int) (self::WINDOW_SECONDS / 60)],
            block: $block,
        );
    }
}
