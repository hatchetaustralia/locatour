<?php

use App\Http\Controllers\Admin\LocationPopupController;
use Filament\Http\Middleware\Authenticate;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Lazy JSON for the Locations overview-map popup. Sits behind the Filament
// admin panel's web + auth stack so only signed-in admins can fetch it; the
// map JS calls it on marker click. Route key defaults to the numeric id, which
// is what the lightweight marker array carries.
Route::middleware(['web', Authenticate::class])
    ->get('/admin/locations/{location}/popup', [LocationPopupController::class, 'show'])
    ->name('admin.locations.popup');
