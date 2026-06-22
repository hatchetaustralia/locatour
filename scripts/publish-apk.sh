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
ABIS="${APK_ABIS:-arm64-v8a}"
echo "Building release APK for ABIs: $ABIS …"
cd "$ROOT/android"
./gradlew assembleRelease -PreactNativeArchitectures="$ABIS"

SRC="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
DEST="$ROOT/backend/public/locatour.apk"
cp "$SRC" "$DEST"

LAN_IP="$( (ipconfig getifaddr en0 || ipconfig getifaddr en1) 2>/dev/null || echo '<mac-lan-ip>')"
echo
echo "✅ Published → $DEST"
echo "   On the phone: re-download http://${LAN_IP}:8000/locatour.apk and reinstall."
