/**
 * Runtime configuration for the Locatour app.
 *
 * The API base URL is read from the `EXPO_PUBLIC_API_URL` env var, which Expo's
 * bundler inlines into `process.env` at build time (any var prefixed
 * `EXPO_PUBLIC_` is exposed to the client bundle). Set it in a `.env` file at
 * the project root, e.g.:
 *
 *   EXPO_PUBLIC_API_URL=http://192.168.20.10:8000
 *
 * IMPORTANT — physical devices: `localhost` / `127.0.0.1` resolve to the device
 * itself, NOT your Mac. On a real phone you MUST use either:
 *   • your Mac's LAN IP, e.g. http://192.168.20.10:8000  (find it with `ipconfig getifaddr en0`), or
 *   • the Laravel Herd domain reachable on the network, e.g. http://locatour-api.test
 * The iOS Simulator can use http://localhost:8000; the Android emulator uses
 * http://10.0.2.2:8000 to reach the host machine.
 *
 * The default below targets the Herd domain so a freshly cloned checkout points
 * somewhere sensible; override per-machine via `.env`. If the API is
 * unreachable, storage.getLocations() falls back to the bundled mock locations.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://locatour-api.test';

/**
 * Candidate API base URLs, tried in order until one responds. The configured
 * URL (your Mac's LAN IP for a physical phone) comes first; `10.0.2.2:8000` is
 * the Android emulator's alias for the host machine — so the SAME build works on
 * a real device and the emulator without rebuilding.
 */
export const API_URLS: string[] = Array.from(
  new Set([API_URL, 'http://10.0.2.2:8000'].filter(Boolean)),
);

/** How long (ms) to wait on each API base before trying the next / falling back.
 *  8s tolerates a slightly slow first response over LAN / the dev server without
 *  prematurely falling through. Multipart uploads use their own longer timeout. */
export const API_TIMEOUT_MS = 8000;
