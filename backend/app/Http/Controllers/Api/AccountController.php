<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Lightweight Phase 1 account API for the mobile app. Auth is device-id based:
 * the app sends its stable local uid as `device_id` and we issue a Sanctum
 * token. Phase 2 (Firebase OTP + SSO) will layer onto this same AppUser model.
 */
class AccountController extends Controller
{
    /**
     * POST /api/account/register  (public)
     * Upserts the AppUser by device_id and returns a fresh Sanctum token.
     */
    public function register(Request $request): JsonResponse
    {
        $data = $this->validateProfile($request, registering: true, ignoreDeviceId: $request->input('device_id'));

        $deviceId = $data['device_id'];
        unset($data['device_id']);

        $appUser = AppUser::updateOrCreate(
            ['device_id' => $deviceId],
            $data,
        );

        $token = $appUser->createToken('app')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $appUser->fresh(),
        ]);
    }

    /**
     * GET /api/account/username-available?username=foo[&device_id=bar]  (public)
     * Returns { available: bool } — true if no OTHER app user holds that
     * username (the caller's own device_id, if given, doesn't count as taken).
     * Powers the live "✓ available / ✗ taken" check in signup + profile edit.
     */
    public function usernameAvailable(Request $request): JsonResponse
    {
        $username = trim((string) $request->query('username', ''));
        if (mb_strlen($username) < 3) {
            return response()->json(['available' => false, 'reason' => 'too_short']);
        }

        $taken = AppUser::query()
            ->whereRaw('lower(username) = ?', [mb_strtolower($username)])
            ->when($request->query('device_id'), fn ($q, $deviceId) => $q->where('device_id', '!=', $deviceId))
            ->exists();

        return response()->json(['available' => ! $taken]);
    }

    /**
     * POST /api/account/sync  (auth:sanctum)
     * Updates the authenticated AppUser's profile + stats.
     */
    public function sync(Request $request): JsonResponse
    {
        /** @var AppUser $appUser */
        $appUser = $request->user();

        $data = $this->validateProfile($request, registering: false, ignoreDeviceId: $appUser->device_id);

        $appUser->update($data);

        return response()->json([
            'user' => $appUser->fresh(),
        ]);
    }

    /**
     * Shared validation for register/sync. `device_id` is only accepted (and
     * required) when registering; sync never lets a client move accounts.
     *
     * @return array<string, mixed>
     */
    private function validateProfile(Request $request, bool $registering, ?string $ignoreDeviceId = null): array
    {
        $rules = [
            'display_name' => ['nullable', 'string', 'max:255'],
            // Username is the unique public handle. Ignore the caller's own row
            // (by device_id) so re-registering / syncing the same account keeps it.
            'username' => [
                'nullable', 'string', 'max:255', 'min:3',
                Rule::unique('app_users', 'username')->ignore($ignoreDeviceId ?? '__none__', 'device_id'),
            ],
            'email' => ['nullable', 'string', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string'],
            'avatar_url' => ['nullable', 'string', 'max:2048'],
            'gender' => ['nullable', 'string', 'max:255'],
            'home_suburb' => ['nullable', 'string', 'max:255'],
            'interests' => ['nullable', 'array'],
            'total_xp' => ['nullable', 'integer'],
            'current_level' => ['nullable', 'integer'],
            'day_streak' => ['nullable', 'integer'],
        ];

        if ($registering) {
            $rules['device_id'] = ['required', 'string', 'max:255'];
            // display_name/username are sensible defaults on first register.
            $rules['display_name'][0] = 'required';
            $rules['username'][0] = 'required';
        }

        // Only persist keys the client actually sent (so sync is a partial update).
        return $request->only(array_keys($request->validate($rules)));
    }
}
