<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountFlag;
use App\Models\AppCheckIn;
use App\Models\AppUser;
use App\Support\Leveling;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Lightweight Phase 1 account API for the mobile app. Auth is device-id based:
 * the app sends its stable local uid as `device_id` and we issue a Sanctum
 * token. Phase 2 (Firebase OTP + SSO) will layer onto this same AppUser model.
 */
class AccountController extends Controller
{
    /** Cooldown (seconds) imposed AFTER the 1st base-location change: 24 hours. */
    private const BASE_COOLDOWN_FIRST = 86400;

    /** Cooldown (seconds) AFTER every subsequent base-location change: ~30 days. */
    private const BASE_COOLDOWN_RECURRING = 2592000;

    /** Rejected change attempts during a cooldown before we flag the account. */
    private const BASE_CHURN_FLAG_ATTEMPTS = 3;

    /**
     * POST /api/account/register  (public)
     * Upserts the AppUser by device_id and returns a fresh Sanctum token.
     */
    public function register(Request $request): JsonResponse
    {
        $data = $this->validateProfile($request, registering: true, ignoreDeviceId: $request->input('device_id'));

        // Age gate: if date_of_birth is provided, the user must be at least 13.
        // Nullable — legacy callers without DOB are allowed through unchanged.
        if (isset($data['date_of_birth'])) {
            $dob = Carbon::parse($data['date_of_birth']);
            if ($dob->age < 13) {
                return response()->json([
                    'message' => 'Locatour is currently available for users aged 13 and above.',
                ], 422);
            }
        }

        $deviceId = $data['device_id'];
        unset($data['device_id']);

        $existing = AppUser::where('device_id', $deviceId)->first();

        if ($existing) {
            // Re-register (self-heal when the token was lost). NEVER let a
            // re-register silently move the base location — that is only allowed
            // through the cooldown-guarded /account/base-location endpoint.
            unset($data['home_suburb'], $data['home_lat'], $data['home_lng']);
            $existing->update($data);
            $appUser = $existing;
        } else {
            // First registration = the initial base set (free, no cooldown).
            // Stamp home_changed_at so the FIRST later change computes its
            // cooldown window from now.
            if (array_key_exists('home_suburb', $data) || array_key_exists('home_lat', $data)) {
                $data['home_changed_at'] = now();
            }
            $appUser = AppUser::create(['device_id' => $deviceId] + $data);
        }

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

        // Base location is trust-sensitive and cooldown-guarded: sync must never
        // change it, even if the client includes it in the profile payload. The
        // ONLY path that mutates it is baseLocation() below.
        unset($data['home_suburb'], $data['home_lat'], $data['home_lng']);

        // total_xp is now SERVER-DERIVED (sum of check-in points + bonus_xp), so
        // the client no longer dictates it. Dropping any client-sent XP/level here
        // is what makes a revoke stick: a stale client can't re-inflate total_xp
        // past a deletion (the old max(stored, reported) reconciliation did exactly
        // that). Earned XP reaches the server via check-in uploads (which recalc),
        // not via this endpoint. Recompute after the profile update so the
        // response carries the authoritative value.
        unset($data['total_xp'], $data['current_level']);

        $appUser->update($data);
        $appUser->recalcXp();

        return response()->json([
            'user' => $appUser->fresh(),
        ]);
    }

    /**
     * POST /api/account/base-location  (auth:sanctum)
     *
     * The ONLY path that changes a user's base/home location after the initial
     * onboarding set. Server-authoritative so a tampered client can't bypass it.
     *
     * Escalating, PIN-lockout-style cooldown: the 1st change is free, then a 24h
     * lock, then a ~30-day lock for every change after that. Trying to change
     * while locked is rejected (429) and counts as an attempt; repeated attempts
     * raise a base_location_churn flag for admin review. No auto-ban — the
     * cooldown itself is the enforcement (genuine movers/travellers are never
     * auto-banned, only briefly throttled).
     */
    public function baseLocation(Request $request): JsonResponse
    {
        /** @var AppUser $appUser */
        $appUser = $request->user();

        $data = $request->validate([
            'home_suburb' => ['required', 'string', 'max:255'],
            'home_lat' => ['required', 'numeric', 'between:-90,90'],
            'home_lng' => ['required', 'numeric', 'between:-180,180'],
        ]);

        // Serialize concurrent change requests with a row lock so two near-
        // simultaneous POSTs can't both read the same pre-change state and slip
        // past the cooldown (lockForUpdate is a real row lock on MySQL/Postgres
        // and a harmless no-op on SQLite).
        return DB::transaction(function () use ($appUser, $data) {
            /** @var AppUser $user */
            $user = AppUser::whereKey($appUser->getKey())->lockForUpdate()->first();

            $now = now();
            $count = (int) $user->home_change_count;
            $last = $user->home_changed_at;

            // Cooldown required BEFORE this change, based on how many changes
            // already happened: 0 → free (first change), 1 → 24h, 2+ → 30 days.
            $cooldown = $count === 0
                ? 0
                : ($count === 1 ? self::BASE_COOLDOWN_FIRST : self::BASE_COOLDOWN_RECURRING);

            if ($cooldown > 0 && $last !== null && $last->diffInSeconds($now) < $cooldown) {
                // Locked. Record the rejected attempt; repeated hammering flags
                // the account for review (idempotent flag; never auto-blocks).
                $attempts = (int) $user->home_change_attempts + 1;
                $user->update(['home_change_attempts' => $attempts]);

                if ($attempts >= self::BASE_CHURN_FLAG_ATTEMPTS) {
                    $user->flagFor(
                        AccountFlag::TYPE_BASE_LOCATION_CHURN,
                        'Repeated base-location change attempts during cooldown',
                        ['attempts' => $attempts, 'change_count' => $count],
                        block: false,
                    );
                }

                return response()->json([
                    'error' => 'cooldown',
                    'next_change_at' => $last->copy()->addSeconds($cooldown)->toIso8601String(),
                    'attempts' => $attempts,
                ], 429);
            }

            // Allowed — apply the change and open the next cooldown window.
            $newCount = $count + 1;
            $user->update([
                'home_suburb' => $data['home_suburb'],
                'home_lat' => $data['home_lat'],
                'home_lng' => $data['home_lng'],
                'home_changed_at' => $now,
                'home_change_count' => $newCount,
                'home_change_attempts' => 0,
            ]);

            $nextCooldown = $newCount === 1 ? self::BASE_COOLDOWN_FIRST : self::BASE_COOLDOWN_RECURRING;

            return response()->json([
                'user' => $user->fresh(),
                'next_change_at' => $now->copy()->addSeconds($nextCooldown)->toIso8601String(),
            ]);
        });
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
            // Accepted on first register (initial base set); ignored on sync and
            // re-register (base changes go through baseLocation() only).
            'home_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'home_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'interests' => ['nullable', 'array'],
            'total_xp' => ['nullable', 'integer'],
            'current_level' => ['nullable', 'integer'],
            'day_streak' => ['nullable', 'integer'],
            // Age verification. Nullable — existing callers without DOB still work.
            // When provided at registration the age gate (>= 13) is enforced above
            // before this method returns; sync ignores it (account already exists).
            'date_of_birth' => ['nullable', 'date', 'before:today'],
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

    /**
     * Permanently delete the authed account and ALL its data. Check-ins are deleted
     * via the model (firing the photo-removal hook); tokens are revoked. Irreversible.
     */
    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        // Atomic: a mid-delete failure (e.g. a photo-removal hook) must not leave a
        // half-deleted account behind.
        DB::transaction(function () use ($user): void {
            $user->tokens()->delete();
            $user->checkIns->each->delete(); // fires the photo-removal hook per row
            $user->delete();
        });

        return response()->json(['deleted' => true]);
    }

    /**
     * GET /api/account/me — the authed user's FULL state, so the app can hydrate its
     * local DB on sign-in (restores history on a new device / after sign-out). Profile
     * + check-in history (with public photo URLs) + unlocked hidden-spot ids.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load(['checkIns', 'unlockedLocations']);

        return response()->json([
            'user' => $user->only([
                'device_id', 'username', 'display_name', 'email', 'avatar_url', 'bio',
                'gender', 'home_suburb', 'home_lat', 'home_lng', 'interests', 'total_xp',
                'current_level', 'day_streak',
            ]),
            'check_ins' => $user->checkIns->map(fn (AppCheckIn $c): array => [
                'server_id' => $c->id,
                'location_id' => $c->location_id,
                'photo_url' => $c->photo_url,
                'points_earned' => $c->points_earned,
                'latitude' => $c->latitude,
                'longitude' => $c->longitude,
                'verified_offline' => $c->verified_offline,
                'checked_in_at' => optional($c->checked_in_at)->toISOString(),
            ])->values(),
            'unlocked_location_ids' => $user->unlockedLocations->pluck('location_id')->values(),
        ]);
    }

    /** POST /api/account/unlocks — record a hidden spot the user has reached/unlocked. */
    public function recordUnlock(Request $request): JsonResponse
    {
        $data = $request->validate(['location_id' => ['required', 'string', 'max:255']]);
        $request->user()->unlockedLocations()->firstOrCreate(['location_id' => $data['location_id']]);

        return response()->json(['ok' => true]);
    }
}
