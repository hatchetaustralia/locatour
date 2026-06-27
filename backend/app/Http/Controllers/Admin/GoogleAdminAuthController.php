<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

/**
 * Admin (Filament) "Sign in with Google" via Socialite. ONLY Google accounts whose
 * email is in services.google.admin_emails may enter; a first-time allowlisted user
 * is created with the 'admin' role. The redirect URL is built from the REQUEST host
 * so it matches whichever registered origin the page was loaded from. NOTE: Google
 * rejects the `.test` Herd domain as a redirect URI, so load the admin at
 * http://localhost:8000/admin (php artisan serve) or the ngrok HTTPS URL.
 */
class GoogleAdminAuthController extends Controller
{
    public function redirect(Request $request)
    {
        return Socialite::driver('google')
            ->redirectUrl($this->callbackUrl($request))
            ->redirect();
    }

    public function callback(Request $request)
    {
        try {
            $googleUser = Socialite::driver('google')
                ->redirectUrl($this->callbackUrl($request))
                ->user();
        } catch (\Throwable $e) {
            return redirect('/admin/login')->withErrors(['email' => 'Google sign-in failed — please try again.']);
        }

        $email = strtolower(trim((string) $googleUser->getEmail()));
        if ($email === '' || ! in_array($email, $this->allowlist(), true)) {
            abort(403, 'This Google account is not permitted to access the admin.');
        }

        $user = User::firstOrNew(['email' => $email]);
        if (! $user->exists) {
            $user->name = $googleUser->getName() ?: $email;
            $user->password = bcrypt(Str::random(40)); // unused — Google is the login method
            $user->save();
            $user->assignRole('admin');
        }

        Auth::login($user, remember: true);

        return redirect('/admin');
    }

    /** @return array<int, string> */
    private function allowlist(): array
    {
        return collect(explode(',', (string) config('services.google.admin_emails')))
            ->map(fn ($e) => strtolower(trim($e)))
            ->filter()
            ->all();
    }

    private function callbackUrl(Request $request): string
    {
        return $request->getSchemeAndHttpHost().'/admin/oauth/google/callback';
    }
}
