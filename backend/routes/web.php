<?php

use App\Http\Controllers\Admin\GoogleAdminAuthController;
use App\Http\Controllers\Admin\LocationPopupController;
use App\Http\Controllers\ShareController;
use Filament\Http\Middleware\Authenticate;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

// Homepage → the admin panel. Visiting the root lands you on the Filament
// (Google) login when you're not signed in, so "/" effectively is the login.
Route::redirect('/', '/admin');

// Public APK download — a clean, stable link on our own domain. Redirects to the
// stored APK with a content-hash cache-buster so the SAME url always serves the
// latest build (no stale 4h edge cache after a rebuild), while the actual bytes
// still stream from object storage / CDN rather than through the app.
Route::get('/download/locatour.apk', function () {
    $disk = Storage::disk('public');
    abort_unless($disk->exists('locatour.apk'), 404);
    $v = substr(md5((string) $disk->lastModified('locatour.apk')), 0, 10);
    return redirect()->away($disk->url('locatour.apk') . '?v=' . $v);
})->name('download.apk');

// Admin "Sign in with Google" (Socialite). PUBLIC — these routes ARE the login.
// The callback gates by the services.google.admin_emails allowlist and creates an
// 'admin'-role user on first sign-in.
Route::get('/admin/oauth/google/redirect', [GoogleAdminAuthController::class, 'redirect'])
    ->name('admin.google.redirect');
Route::get('/admin/oauth/google/callback', [GoogleAdminAuthController::class, 'callback'])
    ->name('admin.google.callback');

// PUBLIC shared check-in page (no auth). Unguessable token; renders a card with
// Open Graph / Twitter meta so the link unfurls a rich photo preview when shared
// to messaging/social, plus a "Get Locatour" install CTA.
Route::get('/c/{token}', [ShareController::class, 'show'])->name('share.checkin');

// Lazy JSON for the Locations overview-map popup. Sits behind the Filament
// admin panel's web + auth stack so only signed-in admins can fetch it; the
// map JS calls it on marker click. Route key defaults to the numeric id, which
// is what the lightweight marker array carries.
Route::middleware(['web', Authenticate::class])
    ->get('/admin/locations/{location}/popup', [LocationPopupController::class, 'show'])
    ->name('admin.locations.popup');
