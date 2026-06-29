/**
 * Phase 1 account + upload module.
 *
 * Lightweight, device-id-based accounts: the app's local user uid (e.g.
 * "user_ab12cd") is sent as `device_id`, the Laravel API upserts an AppUser and
 * issues a Sanctum token, which we persist in the SQLite kv store. The token is
 * the bearer for /account/sync and /checkins.
 *
 * EVERYTHING here is offline-first and fail-soft: no function throws on a
 * network error, and none of them must ever block rendering or the check-in UI.
 * Photos + queued check-ins survive offline and are retried on the next launch
 * / next successful check-in (uploadPendingCheckIns).
 *
 * Phase 2 (Firebase OTP + SSO) layers onto the SAME AppUser row — nothing here
 * hardcodes the device-id-only assumption beyond the register payload.
 */
import { Platform } from 'react-native';

import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { API_URLS, API_TIMEOUT_MS, GOOGLE_WEB_CLIENT_ID } from '../constants/config';
import { storage } from './storage';
import { fetchPlaceCoordinates } from './places';
import { User, CheckIn } from '../types';

// Multipart check-in uploads carry a photo (hundreds of KB), so the quick
// JSON-request timeout (API_TIMEOUT_MS) is far too short for them over a phone /
// dev server — a slow upload would abort, requeue, and never land. Give uploads
// their own generous timeout.
const UPLOAD_TIMEOUT_MS = 30000;

// Track whether we've already surfaced the "account blocked" state so we only
// warn once per session rather than on every failed request.
let blockedNotified = false;

/** Whether the authed account has been flagged blocked by the server (403). */
export function isAccountBlocked(): boolean {
  return blockedNotified;
}

/** The persisted Sanctum bearer token, or null if the device hasn't registered. */
export function getToken(): string | null {
  return storage.getToken();
}

export type UsernameStatus = 'available' | 'taken' | 'too_short' | 'unknown';

// ── Google SSO ──────────────────────────────────────────────────────────────
/** The AppUser row the server returns from /api/auth/google (snake_case). */
type ServerAppUser = {
  device_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  gender?: string | null;
  home_suburb?: string | null;
  home_lat?: number | null;
  home_lng?: number | null;
  interests?: string[] | null;
  total_xp?: number | null;
  current_level?: number | null;
  day_streak?: number | null;
};

/** Map the server's AppUser row onto the app's local User. */
function mapServerUser(u: ServerAppUser): User {
  const rawUsername = (u.username ?? 'explorer').replace(/^@/, '');
  return {
    uid: u.device_id ?? `user_${Math.random().toString(36).slice(2, 11)}`,
    displayName: u.display_name ?? '',
    username: `@${rawUsername}`,
    bio: u.bio ?? '',
    avatarUrl: u.avatar_url ?? '',
    gender: u.gender ?? '',
    homeSuburb: u.home_suburb ?? '',
    homeCoordinates:
      u.home_lat != null && u.home_lng != null
        ? { latitude: u.home_lat, longitude: u.home_lng }
        : undefined,
    interests: u.interests ?? [],
    stats: {
      dayStreak: u.day_streak ?? 0,
      totalXP: u.total_xp ?? 0,
      uniqueLocations: 0,
      totalCheckIns: 0,
      currentLevel: u.current_level ?? 1,
      currentXPInLevel: 0,
      xpNeededForNextLevel: 100,
    },
    createdAt: new Date().toISOString(),
  };
}

let googleConfigured = false;
function ensureGoogleConfigured(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
  googleConfigured = true;
}

export type GoogleSignInResult =
  | { ok: true; isNew: boolean }
  | { ok: false; reason: 'cancelled' | 'unconfigured' | 'play_services' | 'rejected' | 'offline' };

/**
 * Real Google sign-in. Opens the native account picker, gets an ID token, then
 * verifies + links/creates the account server-side (/api/auth/google) and persists
 * the issued Sanctum token + resolved profile locally. Self-contained — the backend
 * provisions the account, so this does NOT go through device-register. Never throws.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!GOOGLE_WEB_CLIENT_ID) return { ok: false, reason: 'unconfigured' };
  try {
    ensureGoogleConfigured();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { ok: false, reason: 'cancelled' };

    const idToken = response.data.idToken;
    if (!idToken) return { ok: false, reason: 'rejected' };

    // The native Google account picker hands back the user's profile photo
    // directly (independent of whatever avatar the server has on file). Capture
    // it now so we can persist it SEPARATELY and keep it selectable in the avatar
    // picker even after the user switches to a preset.
    const googlePhoto = response.data.user?.photo ?? null;

    // Identity-based: do NOT send the device's account id, so a Google login never
    // inherits an anonymous device account's progress — it's keyed to the Google
    // identity (google_id / verified email) server-side.
    const res = await fetchWithFallback('/api/auth/google', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    });
    if (!res) return { ok: false, reason: 'offline' };
    if (!res.ok) return { ok: false, reason: 'rejected' };

    const body = (await res.json()) as { token?: string; is_new?: boolean; user?: ServerAppUser };
    if (!body.token || !body.user) return { ok: false, reason: 'rejected' };

    // Clear any PREVIOUS account's device-local data before adopting this one, so a
    // different account never inherits the last user's check-ins/photos/achievements
    // on a shared device. The /api/auth/google call above needs no token, so wiping
    // here (after it) is safe.
    await storage.wipeAllData();
    storage.setToken(body.token);
    const mapped = mapServerUser(body.user);
    // Persist the Google photo separately so the avatar picker can always offer
    // it back, regardless of the current avatarUrl. For a brand-new account the
    // server seeds avatarUrl from this same photo; once the user picks a preset
    // the two diverge and providerAvatarUrl is how we restore the Google one.
    if (googlePhoto) mapped.providerAvatarUrl = googlePhoto;
    await storage.setUser(mapped);
    // Restore the account's full state (check-in history + unlocked spots) so a
    // returning user / new device isn't left empty. New users get an empty payload.
    const state = await fetchAccountState();
    if (state) await storage.hydrateFromServer(state.checkIns, state.unlockedIds);
    return { ok: true, isNew: !!body.is_new };
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: 'cancelled' };
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { ok: false, reason: 'play_services' };
    }
    console.warn('[account] signInWithGoogle failed (soft)', e);
    return { ok: false, reason: 'offline' };
  }
}

/**
 * App-store reviewer / demo sign-in. POSTs a secret code to /api/auth/demo and,
 * on success, adopts the returned sandboxed demo account — which is pre-onboarded
 * (home base set) so the app lands straight on the map with no Google flow. The
 * code is provided to reviewers in the store's "App access" notes and entered via
 * the hidden logo-tap on the login screen. Mirrors the tail of signInWithGoogle.
 */
export async function signInWithDemo(code: string): Promise<GoogleSignInResult> {
  try {
    const res = await fetchWithFallback('/api/auth/demo', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!res) return { ok: false, reason: 'offline' };
    if (!res.ok) return { ok: false, reason: 'rejected' };

    const body = (await res.json()) as { token?: string; is_new?: boolean; user?: ServerAppUser };
    if (!body.token || !body.user) return { ok: false, reason: 'rejected' };

    await storage.wipeAllData();
    storage.setToken(body.token);
    await storage.setUser(mapServerUser(body.user));

    const state = await fetchAccountState();
    if (state) await storage.hydrateFromServer(state.checkIns, state.unlockedIds);
    return { ok: true, isNew: false };
  } catch (e) {
    console.warn('[account] signInWithDemo failed', e);
    return { ok: false, reason: 'offline' };
  }
}

/**
 * Sign out: end the Google session, drop the Sanctum token, and clear the local
 * user so the app returns to the login screen. Local game data (check-ins etc.)
 * stays on the device — the server account is unaffected and re-adopts on the next
 * sign-in. Fail-soft.
 */
// ── Account state restore ────────────────────────────────────────────────────
type ServerCheckIn = {
  server_id: number | string;
  location_id: string;
  photo_url: string | null;
  points_earned: number | null;
  latitude: number | null;
  longitude: number | null;
  verified_offline: boolean;
  checked_in_at: string | null;
};

function mapServerCheckIn(c: ServerCheckIn, userId: string): CheckIn {
  return {
    id: `srv_${c.server_id}`,
    userId,
    locationId: c.location_id,
    photoUrl: c.photo_url ?? '',
    pointsEarned: c.points_earned ?? 0,
    timestamp: c.checked_in_at ?? new Date().toISOString(),
    coordinatesChecked: { latitude: c.latitude ?? 0, longitude: c.longitude ?? 0 },
    verifiedOffline: !!c.verified_offline,
    serverId: c.server_id,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Pull the authed account's full state (check-in history + unlocked spots) from
 * the server, mapped to local shapes. Returns null on no-token / offline / error
 * — the caller should then just keep whatever local state it has. Never throws.
 */
export async function fetchAccountState(): Promise<{ checkIns: CheckIn[]; unlockedIds: string[] } | null> {
  const token = storage.getToken();
  if (!token) return null;
  try {
    const uid = (await storage.getUser())?.uid ?? '';
    const res = await fetchWithFallback('/api/account/me', {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res || !res.ok) return null;
    const body = (await res.json()) as {
      check_ins?: ServerCheckIn[];
      unlocked_location_ids?: string[];
    };
    return {
      checkIns: (body.check_ins ?? []).map((c) => mapServerCheckIn(c, uid)),
      unlockedIds: body.unlocked_location_ids ?? [],
    };
  } catch {
    return null;
  }
}

/** Record a reached/unlocked hidden spot server-side so it restores on a new device. */
export async function recordUnlock(locationId: string): Promise<void> {
  const token = storage.getToken();
  if (!token) return;
  try {
    await fetchWithFallback('/api/account/unlocks', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ location_id: locationId }),
    });
  } catch {
    // fire-and-forget — the next check-in also records the unlock server-side
  }
}

export async function signOut(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // not signed in via Google / module unavailable — ignore
  }
  // Full local wipe (not just user+token): game data (check-ins, photos,
  // achievements, unlocked spots) is device-local and NOT account-scoped, so
  // leaving it would bleed into whoever signs in next on a shared device. The
  // server account is untouched and the level/XP re-adopt on next sign-in.
  await storage.wipeAllData();
}

/**
 * Permanently delete the account: revoke it server-side (best-effort), then WIPE
 * all local data + the Google session so the app returns to a fresh-install state.
 * The local wipe ALWAYS runs — even offline / if the server call fails — so the
 * device is never left showing a deleted account's data. Never throws.
 */
export async function deleteAccount(): Promise<void> {
  const token = storage.getToken();
  if (token) {
    try {
      await fetchWithFallback('/api/account', {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch {
      // offline / already gone — wipe locally regardless
    }
  }
  try {
    await GoogleSignin.signOut();
  } catch {
    // not signed in via Google — ignore
  }
  await storage.wipeAllData();
}

/**
 * Live username availability check (the public handle is unique). Pass the
 * device's own uid so the caller's existing username doesn't read as "taken"
 * when editing. 'unknown' = couldn't reach the server (offline) — the UI should
 * stay neutral and let the backend be the final arbiter on save.
 */
export async function checkUsernameAvailable(
  username: string,
  deviceId?: string,
): Promise<UsernameStatus> {
  const u = username.trim();
  if (u.length < 3) return 'too_short';
  try {
    let path = `/api/account/username-available?username=${encodeURIComponent(u)}`;
    if (deviceId) path += `&device_id=${encodeURIComponent(deviceId)}`;
    const res = await fetchWithFallback(path, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res || !res.ok) return 'unknown';
    const body = (await res.json()) as { available?: boolean; reason?: string };
    if (body.reason === 'too_short') return 'too_short';
    return body.available ? 'available' : 'taken';
  } catch {
    return 'unknown';
  }
}

// Map the local User shape → the API's snake_case profile + stats payload.
// Only fields the backend accepts are included; everything is optional on sync.
function profilePayload(user: User): Record<string, unknown> {
  return {
    display_name: user.displayName,
    // The API stores the raw username; strip a leading "@" the app uses for display.
    username: user.username?.startsWith('@') ? user.username.slice(1) : user.username,
    bio: user.bio ?? '',
    avatar_url: user.avatarUrl ?? '',
    gender: user.gender ?? '',
    home_suburb: user.homeSuburb ?? '',
    // Initial base coords (set at first register; ignored by sync/re-register —
    // base changes go through changeBaseLocation()'s cooldown-guarded endpoint).
    home_lat: user.homeCoordinates?.latitude ?? null,
    home_lng: user.homeCoordinates?.longitude ?? null,
    interests: user.interests ?? [],
    total_xp: user.stats?.totalXP ?? 0,
    current_level: user.stats?.currentLevel ?? 1,
    day_streak: user.stats?.dayStreak ?? 0,
  };
}

// Try each candidate API base in turn with a per-attempt timeout. Returns the
// Response of the first base that answers (any status), or null if none did
// (offline / DNS / refused / timeout on every candidate). A 4xx/5xx is still a
// "reachable" answer and is returned so the caller can inspect the status.
async function fetchWithFallback(
  path: string,
  init: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response | null> {
  for (const base of API_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
      return res;
    } catch {
      // Timeout / offline / refused — fall through to the next candidate.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// Inspect a response for the blocked-account 403 so callers can surface it once.
function noteBlockedIf403(res: Response): boolean {
  if (res.status === 403) {
    if (!blockedNotified) {
      blockedNotified = true;
      console.warn('[account] this account has been blocked by an admin');
    }
    return true;
  }
  return false;
}

/** Outcome of a register attempt, so callers can surface an inline message. */
export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'rejected' | 'offline'; message?: string };

/**
 * Register (or re-register) this device's account and persist the issued token.
 * Called at the END of onboarding, after the local user is saved. Never throws.
 *
 * The app collects no birth date — it relies on the store's 13+ age rating
 * rather than in-app age collection. The backend's birth-date field is nullable,
 * so the register payload simply omits it.
 */
export async function registerAccount(user: User): Promise<RegisterResult> {
  try {
    const res = await fetchWithFallback('/api/account/register', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: user.uid,
        ...profilePayload(user),
      }),
    });
    if (!res) return { ok: false, reason: 'offline' };
    if (!res.ok) return { ok: false, reason: 'rejected' };

    const body = (await res.json()) as { token?: string };
    if (body?.token) {
      storage.setToken(body.token);
      blockedNotified = false;
      return { ok: true };
    }
    return { ok: false, reason: 'rejected' };
  } catch (e) {
    console.warn('[account] registerAccount failed (soft)', e);
    return { ok: false, reason: 'offline' };
  }
}

/**
 * Push the local profile + stats to the server for the authed account.
 * Fire-and-forget on app start. No-op (returns false) when there's no token —
 * i.e. the user hasn't signed in with Google yet. Google sign-in is the ONLY path
 * that may create a backend account, so this never registers/creates one itself.
 */
export async function syncAccount(): Promise<boolean> {
  try {
    const token = storage.getToken();
    const user = await storage.getUser();
    if (!user) return false;

    // No token → the user hasn't completed Google sign-in. Do NOT register an
    // anonymous device account: that spawned orphan backend app_users (no email /
    // google_id, just a device_id) on every fresh launch. Stay signed-out
    // server-side and let the auth gate route the user to the Google login screen.
    if (!token) return false;

    const res = await fetchWithFallback('/api/account/sync', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(profilePayload(user)),
    });
    if (!res) return false;
    if (noteBlockedIf403(res)) return false;
    // 401 = the stored token is stale/invalid (e.g. the backend DB was reset, so
    // the server no longer knows this token). Drop the dead token, but do NOT
    // re-register: minting a fresh device account here would create an anonymous
    // app_user divorced from the Google identity. The user must sign in with
    // Google again, which re-mints a valid token against their real account.
    if (res.status === 401) {
      storage.clearToken();
      return false;
    }
    return res.ok;
  } catch (e) {
    console.warn('[account] syncAccount failed (soft)', e);
    return false;
  }
}

/**
 * Backfill the user's base coordinates if we have a home suburb but no coords yet
 * (e.g. profiles created before this feature). Geocodes the suburb via the server
 * proxy and persists the result LOCALLY so the map can warm-start there. This is
 * not a "change" — it's filling in the missing coords for the SAME suburb — so it
 * never touches the cooldown. Fire-and-forget on app start; fail-soft.
 */
export async function ensureHomeCoordinates(): Promise<void> {
  try {
    const user = await storage.getUser();
    if (!user || !user.homeSuburb || user.homeCoordinates) return;
    const coords = await fetchPlaceCoordinates({ suburb: user.homeSuburb });
    if (!coords) return;
    const fresh = await storage.getUser();
    if (fresh && !fresh.homeCoordinates) {
      fresh.homeCoordinates = coords;
      await storage.setUser(fresh);
    }
  } catch (e) {
    console.warn('[account] ensureHomeCoordinates failed (soft)', e);
  }
}

/**
 * Whether a signed-in user still needs to run the onboarding story (walkthrough →
 * profile → customize). Returns false for a null user — sending an unauthenticated
 * user to LOGIN is the login gate's job, not onboarding's.
 *
 * `homeSuburb` is the reliable "completed onboarding" marker: it's set ONLY by the
 * customize step (the last screen of onboarding), and the rest of the codebase
 * already treats it that way (ensureHomeCoordinates backfills coords only when a
 * suburb exists). We stay CONSERVATIVE — requiring BOTH a missing suburb AND
 * missing coordinates — so a genuinely-onboarded user is never bounced back into
 * onboarding (e.g. one whose coords are momentarily un-backfilled). A brand-new or
 * pre-existing-but-incomplete account (default `@explorer`, no home base) has
 * neither, so it correctly routes through onboarding.
 */
export function needsOnboarding(user: User | null): boolean {
  return !!user && !user.homeSuburb?.trim() && !user.homeCoordinates;
}

/** Result of a guarded base-location change. */
export type BaseLocationResult =
  | { ok: true; nextChangeAt?: string }
  | { ok: false; reason: 'cooldown' | 'offline' | 'blocked' | 'error'; nextChangeAt?: string };

/**
 * Change the user's base/home location through the SERVER's cooldown-guarded
 * endpoint (the only path allowed to move it after onboarding). Resolves the
 * suburb to coordinates, then POSTs to /api/account/base-location. On success the
 * local user is updated to match; on a 429 the server's cooldown is surfaced so
 * the UI can say when the next change is allowed. Never throws.
 */
export async function changeBaseLocation(suburb: string, placeId?: string): Promise<BaseLocationResult> {
  try {
    const token = storage.getToken();
    if (!token) return { ok: false, reason: 'error' };

    const coords = await fetchPlaceCoordinates({ placeId, suburb });
    if (!coords) return { ok: false, reason: 'error' };

    const res = await fetchWithFallback('/api/account/base-location', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        home_suburb: suburb,
        home_lat: coords.latitude,
        home_lng: coords.longitude,
      }),
    });

    if (!res) return { ok: false, reason: 'offline' };
    if (noteBlockedIf403(res)) return { ok: false, reason: 'blocked' };

    const body = (await res.json().catch(() => ({}))) as { next_change_at?: string; error?: string };

    if (res.status === 429) {
      return { ok: false, reason: 'cooldown', nextChangeAt: body.next_change_at };
    }
    if (!res.ok) return { ok: false, reason: 'error' };

    // Mirror the accepted change locally so the map seeds from the new base.
    const user = await storage.getUser();
    if (user) {
      user.homeSuburb = suburb;
      user.homeCoordinates = coords;
      await storage.setUser(user);
    }
    return { ok: true, nextChangeAt: body.next_change_at };
  } catch (e) {
    console.warn('[account] changeBaseLocation failed (soft)', e);
    return { ok: false, reason: 'error' };
  }
}

/** A single check-in to upload (the local-first record's fields). */
export interface PendingUpload {
  locationId: string;
  locationName?: string | null;
  photoUri?: string | null;
  pointsEarned: number;
  latitude?: number | null;
  longitude?: number | null;
  verifiedOffline: boolean;
  checkedInAt: string;
}

/** Result of a check-in upload: ok + the server check-in id when the 2xx body
 *  carried one (so the local record can be deleted server-side later). */
export interface UploadResult {
  ok: boolean;
  serverId?: string | number;
}

// POST one check-in as multipart/form-data with the optional photo file. Returns
// { ok, serverId } — ok on a 2xx, serverId from the response body when present.
// A 403 (blocked) is treated as a permanent failure for THIS item but does not throw.
async function uploadCheckIn(item: PendingUpload, token: string): Promise<UploadResult> {
  try {
    const form = new FormData();
    form.append('location_id', item.locationId);
    if (item.locationName) form.append('location_name', item.locationName);
    form.append('points_earned', String(item.pointsEarned ?? 0));
    if (item.latitude != null) form.append('latitude', String(item.latitude));
    if (item.longitude != null) form.append('longitude', String(item.longitude));
    form.append('verified_offline', item.verifiedOffline ? '1' : '0');
    form.append('checked_in_at', item.checkedInAt);

    // Only attach a real local file:// photo. Remote (https) fallback images and
    // web blob URIs can't be uploaded as a file part, so we skip the photo then.
    if (item.photoUri && item.photoUri.startsWith('file://')) {
      const name = item.photoUri.split('/').pop() || `checkin_${Date.now()}.jpg`;
      // RN's FormData file part is { uri, name, type } cast through unknown — the
      // DOM FormData typings don't model the native file object.
      form.append('photo', {
        uri: item.photoUri,
        name,
        type: 'image/jpeg',
      } as unknown as Blob);
    }

    const res = await fetchWithFallback('/api/checkins', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        // NOTE: do NOT set Content-Type — fetch sets the multipart boundary.
      },
      body: form,
    }, UPLOAD_TIMEOUT_MS);
    if (!res) return { ok: false };
    if (noteBlockedIf403(res)) return { ok: false };
    if (!res.ok) return { ok: false };
    // Capture the created check-in's server id so it can be deleted server-side
    // later (DELETE /api/checkins/{id}). The body is optional — a 2xx without a
    // parseable id still counts as uploaded.
    let serverId: string | number | undefined;
    try {
      const body = (await res.json()) as { check_in?: { id?: string | number } };
      if (body?.check_in?.id != null) serverId = body.check_in.id;
    } catch {
      // No/!JSON body — fine, just no serverId to record.
    }
    return { ok: true, serverId };
  } catch (e) {
    console.warn('[account] uploadCheckIn failed (soft)', e);
    return { ok: false };
  }
}

/**
 * Upload a single, just-recorded check-in immediately. Fire-and-forget after a
 * successful local check-in. On failure the caller has ALREADY queued it locally
 * (offline path) OR it is reconstructable from local history; either way
 * uploadPendingCheckIns() retries on the next launch. Returns { ok, serverId }.
 */
export async function uploadCheckInNow(item: PendingUpload): Promise<UploadResult> {
  const token = storage.getToken();
  if (!token) return { ok: false };
  return uploadCheckIn(item, token);
}

/**
 * Delete one check-in on the server (owner-scoped, auth:sanctum). `serverId` is
 * the SERVER check-in id. Mirrors uploadCheckInNow: bearer token + fallback base
 * URLs + fail-soft (never throws). Returns true on a confirmed delete (2xx, or a
 * 404 — already gone server-side counts as deleted), false otherwise. The local
 * record is removed regardless by storage.deleteCheckIn; this is best-effort so a
 * stale row never lingers on the backend.
 */
export async function deleteCheckInNow(serverId: string | number): Promise<boolean> {
  const token = storage.getToken();
  if (!token) return false;
  try {
    const res = await fetchWithFallback(`/api/checkins/${encodeURIComponent(String(serverId))}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res) return false;
    if (noteBlockedIf403(res)) return false;
    // 404 = the server already has no such check-in; treat as deleted.
    if (res.status === 404) return true;
    return res.ok;
  } catch (e) {
    console.warn('[account] deleteCheckInNow failed (soft)', e);
    return false;
  }
}

/**
 * Mint + fetch the PUBLIC share URL for one of the user's own check-ins
 * (auth:sanctum). `serverId` is the SERVER check-in id (only synced check-ins
 * have one). Returns the public /c/{token} URL, or null on any failure. Mirrors
 * deleteCheckInNow: bearer token + fallback base URLs + fail-soft (never throws).
 */
export async function shareCheckIn(serverId: string | number): Promise<string | null> {
  const token = storage.getToken();
  if (!token) return null;
  try {
    const res = await fetchWithFallback(
      `/api/checkins/${encodeURIComponent(String(serverId))}/share`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!res) return null;
    if (noteBlockedIf403(res)) return null;
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return (data?.url as string | undefined) ?? null;
  } catch (e) {
    console.warn('[account] shareCheckIn failed (soft)', e);
    return null;
  }
}

/** The single live announcement banner (or null) — PUBLIC, no auth. The admin
 *  manages it in Filament; the app polls this and shows the banner until dismissed.
 *  Returns null on any failure (so the app simply shows no banner). */
export async function fetchAnnouncement(): Promise<{ id: number; title?: string | null; body: string } | null> {
  try {
    const res = await fetchWithFallback('/api/announcement', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.announcement ?? null;
  } catch (e) {
    console.warn('[account] fetchAnnouncement failed (soft)', e);
    return null;
  }
}

/** Outcome of a community location suggestion. `message` carries the server's
 *  422 text (e.g. the "within 150 metres" rejection) so the UI can show it inline. */
export interface SuggestionResult {
  ok: boolean;
  message?: string;
}

/**
 * Suggest a new community location the user is standing at (backlog #2). POSTs
 * JSON to /api/suggestions (auth:sanctum). Mirrors uploadCheckInNow /
 * deleteCheckInNow: bearer token + fallback base URLs + fail-soft (never throws).
 *
 * The server re-checks proximity from `user_lat`/`user_lng` and answers 422 with
 * a message when the submitter is further than 150m from the suggested point;
 * that text is returned as `message` so the sheet can surface it. On a 2xx the
 * suggestion is pending staff review. No-ops (returns ok:false) without a token.
 */
export async function submitSuggestion(input: {
  name?: string;
  latitude: number;
  longitude: number;
  notes?: string;
  userLat: number;
  userLng: number;
}): Promise<SuggestionResult> {
  const token = storage.getToken();
  if (!token) return { ok: false };
  try {
    const res = await fetchWithFallback('/api/suggestions', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
        notes: input.notes,
        user_lat: input.userLat,
        user_lng: input.userLng,
      }),
    });
    if (!res) return { ok: false };
    if (noteBlockedIf403(res)) return { ok: false };
    // 422 = the server's proximity (or validation) rejection — return its message.
    if (res.status === 422) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, message: body.message };
    }
    if (!res.ok) return { ok: false };
    return { ok: true };
  } catch (e) {
    console.warn('[account] submitSuggestion failed (soft)', e);
    return { ok: false };
  }
}

/**
 * Flush every locally-queued check-in to the server, removing each item only on
 * a confirmed upload (so a mid-flush network drop keeps the rest queued for the
 * next attempt). Called on app start and after a successful check-in. Never
 * throws; no-ops without a token or on web.
 */
export async function uploadPendingCheckIns(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const token = storage.getToken();
    if (!token) return;

    const queued = await storage.getQueuedUploads();
    for (const q of queued) {
      const r = await uploadCheckIn(q.payload, token);
      if (r.ok) {
        await storage.removeQueuedUpload(q.id);
      } else {
        // Stop on the first failure that isn't a permanent block — likely
        // offline; keep the remaining items for the next flush. If it WAS a
        // block, every subsequent upload would 403 too, so stopping is correct.
        break;
      }
    }
  } catch (e) {
    console.warn('[account] uploadPendingCheckIns failed (soft)', e);
  }
}
