<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureRateLimiters();
    }

    /**
     * Configure the application's rate limiters.
     *
     * The 'locations' limiter is applied to the public GET /api/locations
     * endpoints. 40 requests/minute is generous for normal app use (the app
     * only polls on map pan/zoom), but tight enough to slow down a scraper
     * that needs thousands of grid-point queries to harvest the full catalogue.
     *
     * Authenticated requests are keyed by user ID (more precise); unauthenticated
     * requests fall back to IP (the endpoint is public, so IP is the best we have).
     */
    private function configureRateLimiters(): void
    {
        RateLimiter::for('locations', function (Request $request): Limit {
            return Limit::perMinute(40)
                ->by($request->user('sanctum')?->id ?: $request->ip());
        });
    }
}
