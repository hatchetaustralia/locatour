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

import { API_URLS, API_TIMEOUT_MS } from '../constants/config';
import { storage } from './storage';
import { fetchPlaceCoordinates } from './places';
import { User } from '../types';

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
  | { ok: false; reason: 'age_gate' | 'rejected' | 'offline'; message?: string };

/**
 * Register (or re-register) this device's account and persist the issued token.
 * Called at the END of onboarding, after the local user is saved. Never throws.
 *
 * `dateOfBirth` (ISO `YYYY-MM-DD`) is sent as `date_of_birth` for the backend's
 * 13+ age gate. It is optional because the self-heal re-register path (syncAccount)
 * has no DOB to hand and the backend field is nullable. When the server rejects an
 * under-13 user it answers 422 with a message; that is returned as `reason:
 * 'age_gate'` so the screen can show it inline.
 */
export async function registerAccount(
  user: User,
  dateOfBirth?: string,
): Promise<RegisterResult> {
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
        ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
      }),
    });
    if (!res) return { ok: false, reason: 'offline' };

    // 422 = the backend age gate (or other validation) rejected the registration.
    if (res.status === 422) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, reason: 'age_gate', message: body.message };
    }
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
 * Fire-and-forget on app start. No-op (returns false) when there's no token yet
 * (the device hasn't completed onboarding/registration) — registerAccount must
 * run first. If the token is somehow missing on a registered device, this falls
 * back to a register so we self-heal.
 */
export async function syncAccount(): Promise<boolean> {
  try {
    const token = storage.getToken();
    const user = await storage.getUser();
    if (!user) return false;

    // No token yet → register first (which also persists the token). No DOB to
    // re-send here; the backend field is nullable, so the self-heal still works.
    if (!token) return (await registerAccount(user)).ok;

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
