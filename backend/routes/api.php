<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AchievementController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\CheckInController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Api\PlacesController;
use App\Http\Controllers\Api\SuggestionController;
use App\Http\Middleware\EnsureAppUserNotBlocked;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// Phase 1 mobile app accounts (device-id based lightweight auth).
// register is public (issues a Sanctum token); the rest require a valid token
// AND a non-blocked AppUser (EnsureAppUserNotBlocked 403s blocked accounts).
Route::post('/account/register', [AccountController::class, 'register']);
Route::get('/account/username-available', [AccountController::class, 'usernameAvailable']);

Route::middleware(['auth:sanctum', EnsureAppUserNotBlocked::class])->group(function () {
    Route::post('/account/sync', [AccountController::class, 'sync']);
    // The cooldown-guarded base-location change endpoint (server-authoritative).
    Route::post('/account/base-location', [AccountController::class, 'baseLocation']);
    Route::post('/checkins', [CheckInController::class, 'store']);
    Route::delete('/checkins/{checkIn}', [CheckInController::class, 'destroy']);
    // Community location suggestions submitted by app users from the map.
    // Proximity check (haversine <= 150 m) enforced in SuggestionController.
    Route::post('/suggestions', [SuggestionController::class, 'store']);
});

// Public read-only Locations API (no auth for the prototype).
// Shaped to match the Expo app's ExploreLocation type — a drop-in
// replacement for storage.getLocations().
//
// These routes are intentionally PUBLIC (no auth:sanctum). To require auth
// later, move both Route::get lines into the auth:sanctum group above.
//
// The 'throttle:locations' limiter (40 req/min, keyed by user ID or IP) and
// 'monitor.location.queries' middleware (optional per-account attribution +
// scraping detection) are applied here without breaking public access.
Route::middleware(['throttle:locations', 'monitor.location.queries'])->group(function () {
    Route::get('/locations', [LocationController::class, 'index']);
    Route::get('/locations/{id}', [LocationController::class, 'show']);
});

// Public read-only Achievements catalogue (the app evaluates them locally).
Route::get('/achievements', [AchievementController::class, 'index']);

// Public read-only: the single live announcement banner (or null). The app
// polls this and shows the banner until dismissed. Managed in the admin panel.
Route::get('/announcement', [AnnouncementController::class, 'current']);

// Server-side Google Places (New) suburb autocomplete proxy for onboarding —
// keeps the Maps key off the client. Returns { suggestions: [{description, placeId}] }.
Route::get('/places/suburbs', [PlacesController::class, 'suburbs']);

// Resolve a suburb (placeId or free text) to { lat, lng } so the app can store
// the user's base coordinates and warm-start the map there.
Route::get('/places/coordinates', [PlacesController::class, 'coordinates']);
