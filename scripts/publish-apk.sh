#!/usr/bin/env bash
#
# Rebuild the standalone release APK and publish it to the side-load URL.
#
# The phone installs http://<mac-lan-ip>:8000/locatour.apk, which is served by the
# Laravel app from backend/public/locatour.apk. That file is a COPY of the release
# build, so it only changes when the APK is rebuilt — run this after JS or native
# changes, then re-download + reinstall on the phone.
#
# Usage:  npm run apk        (or: bash scripts/publish-apk.sh)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# This RN/Expo build needs JDK 17 — JDK 25 throws a JvmVendorSpec/IBM_SEMERU error.
if [ -z "${JAVA_HOME:-}" ] && command -v brew >/dev/null 2>&1; then
  export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
fi

# Android SDK location (also pinned in android/local.properties).
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
echo "Using JAVA_HOME=${JAVA_HOME:-<unset>}"
"${JAVA_HOME:+$JAVA_HOME/bin/}java" -version 2>&1 | head -1 || true

# Build only for the phone's architecture by default (arm64-v8a). This keeps the
# APK ~50MB and builds far faster than all 4 ABIs (~120MB, 3/4 of it for emulators
# and 32-bit devices you'll never install on). Need an emulator build? Override:
#   APK_ABIS=arm64-v8a,x86_64 npm run apk
# Detect the Mac's current Wi-Fi/LAN IP (en0 is Wi-Fi on this machine) and BAKE it
# into the app's API base URL. EXPO_PUBLIC_* is inlined into the bundle at build
# time, so the app must be rebuilt whenever the IP changes (e.g. you joined a
# different network). Doing it here keeps the baked API URL and the download URL
# below in lock-step — no more "app can't reach the backend after switching WiFi".
ENV_FILE="$ROOT/.env"
# Stable public tunnel URL (ngrok free static domain), read from .env if present.
FIELD_API_URL="$(grep -E '^FIELD_API_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"

# Choose the API base to bake into the bundle. Default = the field tunnel, so the
# APK reaches the backend anywhere (cellular, not just the LAN) — this is what you
# want for testing out in the field. Force a LAN-only build (faster, same Wi-Fi as
# the Mac, no tunnel required) with:  APK_TARGET=lan npm run apk
if [ "${APK_TARGET:-}" != "lan" ] && [ -n "$FIELD_API_URL" ]; then
  API_URL="$FIELD_API_URL"
  echo "Baking API base URL → ${API_URL} (field tunnel)"
else
  LAN_IP="$( (ipconfig getifaddr en0 || ipconfig getifaddr en1) 2>/dev/null || echo '' )"
  if [ -n "$LAN_IP" ]; then
    API_URL="http://${LAN_IP}:8000"
    echo "Baking API base URL → ${API_URL} (LAN, from en0/en1)"
  else
    API_URL=""
    echo "⚠️  No LAN IP detected and no FIELD_API_URL set — using whatever EXPO_PUBLIC_API_URL is already in .env."
  fi
fi

if [ -n "$API_URL" ]; then
  if grep -q '^EXPO_PUBLIC_API_URL=' "$ENV_FILE" 2>/dev/null; then
    sed -i '' "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=${API_URL}|" "$ENV_FILE"
  else
    printf 'EXPO_PUBLIC_API_URL=%s\n' "$API_URL" >> "$ENV_FILE"
  fi
fi

ABIS="${APK_ABIS:-arm64-v8a}"
echo "Building release APK for ABIs: $ABIS …"
cd "$ROOT/android"
./gradlew assembleRelease -PreactNativeArchitectures="$ABIS"

SRC="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
DEST="$ROOT/backend/public/locatour.apk"
cp "$SRC" "$DEST"

echo
echo "✅ Published → $DEST"
if [ -n "$FIELD_API_URL" ] && [ "${APK_TARGET:-}" != "lan" ]; then
  echo "   In the field: with the ngrok tunnel running, download ${FIELD_API_URL}/locatour.apk on the phone and reinstall."
else
  LAN_IP="$( (ipconfig getifaddr en0 || ipconfig getifaddr en1) 2>/dev/null || echo '<mac-lan-ip>')"
  echo "   On the phone (same Wi-Fi): re-download http://${LAN_IP}:8000/locatour.apk and reinstall."
fi
