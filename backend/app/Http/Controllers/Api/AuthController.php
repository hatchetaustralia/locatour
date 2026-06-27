<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * SSO sign-in (augment model). The app obtains a provider token, POSTs it here; we
 * verify it server-side, then find/link/create the AppUser and issue a Sanctum
 * token — the same token the rest of the API (/account/sync, /checkins) expects.
 *
 * Linking: if a `device_id` is supplied and already has an account (an anonymous
 * device account), we LINK the provider onto it so existing progress is kept.
 * Otherwise we match by provider id, then by verified email, else create fresh.
 *
 * Google now; Apple + phone are planned and will land as sibling methods here.
 */
class AuthController extends Controller
{
    public function google(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id_token' => ['required', 'string'],
            'device_id' => ['nullable', 'string', 'max:255'],
        ]);

        $expectedAud = config('services.google.client_id');
        if (! $expectedAud) {
            return response()->json(['message' => 'Google sign-in is not configured on the server.'], 503);
        }

        // Verify the ID token with Google. The tokeninfo endpoint validates the
        // signature + expiry server-side and returns the claims for a valid token.
        $resp = Http::timeout(8)->acceptJson()->get('https://oauth2.googleapis.com/tokeninfo', [
            'id_token' => $data['id_token'],
        ]);
        if (! $resp->ok()) {
            return response()->json(['message' => 'Invalid Google token.'], 401);
        }
        $claims = $resp->json();

        // The token MUST have been issued for OUR client, and the email verified.
        if (! is_array($claims) || ($claims['aud'] ?? null) !== $expectedAud) {
            return response()->json(['message' => 'Google token was issued for a different app.'], 401);
        }
        // Defence-in-depth: issuer must be Google (tokeninfo only returns claims for
        // Google-signed tokens, but verify the `iss` explicitly anyway).
        $iss = $claims['iss'] ?? '';
        if ($iss !== 'accounts.google.com' && $iss !== 'https://accounts.google.com') {
            return response()->json(['message' => 'Invalid Google token issuer.'], 401);
        }
        $sub = $claims['sub'] ?? null;
        $email = $claims['email'] ?? null;
        $emailVerified = filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if (! $sub || ! $email || ! $emailVerified) {
            return response()->json(['message' => 'Google account email is not verified.'], 401);
        }

        [$user, $isNew] = $this->findOrLink('google_id', $sub, $email, $data['device_id'] ?? null);

        // Fill identity without clobbering anything the user already chose.
        $user->google_id = $sub;
        $user->email = $email;
        if (! $user->auth_provider || $user->auth_provider === 'device') {
            $user->auth_provider = 'google';
        }
        if (empty($user->display_name) && ! empty($claims['name'])) {
            $user->display_name = $claims['name'];
        }
        if (empty($user->avatar_url) && ! empty($claims['picture'])) {
            $user->avatar_url = $claims['picture'];
        }
        if (empty($user->username)) {
            $user->username = $this->uniqueUsername($email);
        }
        // Activity tracking: record this successful sign-in for BOTH new and
        // returning users. login_count starts at 0 (DB default) so ++ is correct
        // even for a brand-new, not-yet-saved account.
        $user->last_login_at = now();
        $user->login_count = (int) $user->login_count + 1;
        $user->save();

        return response()->json([
            'token' => $user->createToken('app')->plainTextToken,
            // is_new lets the app route a brand-new SSO user into the profile/username
            // step (augment) vs sending a returning user straight in.
            'is_new' => $isNew,
            'user' => $user->fresh(),
        ]);
    }

    /**
     * Resolve the account to sign into: existing provider id → linked device account
     * → existing verified email → a fresh (unsaved) account. Returns [user, isNew].
     *
     * @return array{0: AppUser, 1: bool}
     */
    private function findOrLink(string $idColumn, string $providerId, string $email, ?string $deviceId): array
    {
        // Identity-based only: match the Google account by its provider id, then by
        // verified email. We deliberately do NOT match by device_id — linking onto
        // whatever anonymous device account happens to be on the phone made a fresh
        // Google login silently inherit that device's progress (level/check-ins).
        $user = AppUser::where($idColumn, $providerId)->first();
        if (! $user) {
            $user = AppUser::where('email', $email)->first();
        }
        if ($user) {
            return [$user, false];
        }

        return [
            new AppUser([
                'device_id' => $deviceId ?: ('sso_' . Str::random(24)),
                'username' => $this->uniqueUsername($email),
                'auth_provider' => 'google',
                'status' => 'active',
            ]),
            true,
        ];
    }

    /** A unique username seeded from the email local-part (lowercased, sanitised). */
    private function uniqueUsername(string $email): string
    {
        $base = (string) Str::of($email)->before('@')->lower()->replaceMatches('/[^a-z0-9_]/', '');
        if ($base === '') {
            $base = 'explorer';
        }
        $base = substr($base, 0, 20);

        $candidate = $base;
        $i = 0;
        while (AppUser::where('username', $candidate)->exists()) {
            $candidate = $base . (++$i);
        }

        return $candidate;
    }
}
