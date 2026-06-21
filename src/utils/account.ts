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

/**
 * Register (or re-register) this device's account and persist the issued token.
 * Called at the END of onboarding, after the local user is saved. Fire-and-forget
 * safe: resolves to true on success, false on any failure (never throws).
 */
export async function registerAccount(user: User): Promise<boolean> {
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
    if (!res || !res.ok) return false;
    const body = (await res.json()) as { token?: string };
    if (body?.token) {
      storage.setToken(body.token);
      blockedNotified = false;
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[account] registerAccount failed (soft)', e);
    return false;
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

    // No token yet → register first (which also persists the token).
    if (!token) return registerAccount(user);

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

// POST one check-in as multipart/form-data with the optional photo file. Returns
// true on a 2xx, false on any failure. A 403 (blocked) is treated as a permanent
// failure for THIS item but does not throw.
async function uploadCheckIn(item: PendingUpload, token: string): Promise<boolean> {
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
    if (!res) return false;
    if (noteBlockedIf403(res)) return false;
    return res.ok;
  } catch (e) {
    console.warn('[account] uploadCheckIn failed (soft)', e);
    return false;
  }
}

/**
 * Upload a single, just-recorded check-in immediately. Fire-and-forget after a
 * successful local check-in. On failure the caller has ALREADY queued it locally
 * (offline path) OR it is reconstructable from local history; either way
 * uploadPendingCheckIns() retries on the next launch. Returns true if uploaded.
 */
export async function uploadCheckInNow(item: PendingUpload): Promise<boolean> {
  const token = storage.getToken();
  if (!token) return false;
  return uploadCheckIn(item, token);
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
      const ok = await uploadCheckIn(q.payload, token);
      if (ok) {
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
