<?php

use App\Http\Controllers\Api\AchievementController;
use App\Http\Controllers\Api\LocationController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// Public read-only Locations API (no auth for the prototype).
// Shaped to match the Expo app's ExploreLocation type — a drop-in
// replacement for storage.getLocations().
Route::get('/locations', [LocationController::class, 'index']);
Route::get('/locations/{id}', [LocationController::class, 'show']);

// Public read-only Achievements catalogue (the app evaluates them locally).
Route::get('/achievements', [AchievementController::class, 'index']);
