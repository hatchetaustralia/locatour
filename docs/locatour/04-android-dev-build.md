# Android Development Build

Locatour uses a custom **development build** (via `expo-dev-client`) rather than Expo Go. This means the SDK version is always baked into the app binary — no more "incompatible with this version of Expo Go" errors. The Google Maps key can also be restricted to the exact package and SHA-1 fingerprint.

## Why a dev build, not Expo Go

| Expo Go | Development build |
|---|---|
| SDK version set by Expo Go app store release | SDK version baked into your own APK |
| Cannot use custom native modules | Full native module support |
| Google Maps key must be unrestricted | Key can be restricted to `com.hatchet.locatour` + SHA-1 |
| Shared with all Expo users | Your app's own package and signing identity |

---

## Path 1 — EAS cloud build (no Android Studio needed)

This is the recommended path. EAS builds the APK in the cloud and gives you a download link.

### Prerequisites

- Expo account (free tier works): https://expo.dev
- The `eas-cli` tool

### Steps

1. **Install EAS CLI**

   ```bash
   npm install -g eas-cli
   # or without global install:
   npx eas-cli <command>
   ```

2. **Log in to your Expo account**

   ```bash
   eas login
   ```

3. **Configure EAS for this project** (only needed once; `eas.json` already exists)

   ```bash
   eas build:configure
   ```

   This confirms the project is linked to your Expo account. It may prompt you to create a new project on expo.dev — accept and use slug `locatour`.

4. **Trigger the development build**

   ```bash
   eas build --profile development --platform android
   ```

   EAS will:
   - Upload your source
   - Run `expo prebuild` in the cloud to generate native Android code
   - Build a signed `.apk` (internal distribution, no Play Store needed)
   - Give you a QR code / download link when done (typically 5–15 minutes)

5. **Install the APK on your Android device**

   Download and sideload the `.apk` via the QR code, EAS dashboard link, or `adb install <file>.apk`.

   Enable "Install from unknown sources" in Android Settings if prompted.

6. **Start the Metro bundler**

   ```bash
   npx expo start --dev-client
   ```

7. **Open in the dev client**

   - The dev client app (your installed APK) shows a URL input on launch.
   - Either scan the QR code printed by `expo start`, or type the LAN address shown (e.g. `exp+locatour://expo-development-client/?url=http%3A%2F%2F192.168.x.x%3A8081`).
   - Do **not** use Expo Go — the dev client is your new launcher for this project.

### Restricting the Google Maps API key after the build

Once you have your build's signing certificate SHA-1:

```bash
eas credentials
```

Select Android > production/development keystore > view SHA-1. Then in Google Cloud Console:

- APIs & Services > Credentials > your Maps SDK for Android key
- Application restrictions: Android apps
- Add: package `com.hatchet.locatour` + the SHA-1 from above

While developing with the EAS-generated debug keystore, use the debug SHA-1. For production builds, use the release SHA-1. In Expo Go the key had to remain unrestricted; this restriction is now safe.

---

## Path 2 — Local build (requires Android Studio + SDK + USB debugging)

Use this if you want a faster iteration cycle after the first cloud build, or if you need to debug native code locally.

### Prerequisites

- Android Studio installed with the Android SDK (API level 35 recommended)
- `ANDROID_HOME` environment variable set, e.g. `export ANDROID_HOME=$HOME/Library/Android/sdk`
- A physical device with USB debugging enabled, or an AVD (emulator)
- Java 17 (bundled with recent Android Studio)

### Steps

1. **Connect your device or start an emulator**

   Physical device: enable Developer Options > USB Debugging, connect via USB, confirm the prompt on the device.

   Emulator: open Android Studio > Device Manager > start a virtual device.

2. **Run the local build**

   ```bash
   npx expo run:android
   ```

   This runs `expo prebuild` locally (generates `android/` folder), then builds and installs the APK directly to the connected device/emulator using Gradle. Metro starts automatically.

3. **Subsequent starts** (after the first build, as long as native code hasn't changed)

   ```bash
   npx expo start --dev-client
   ```

   Scan the QR or connect via LAN — no rebuild needed.

---

## Notes

- **`expo-dev-client ~55.0.35`** is now in `package.json`. It provides the in-app developer menu (shake device or `Cmd+D` in emulator) and the connection screen.
- The `eas.json` `development` profile sets `buildType: "apk"` (sideloadable) instead of `aab` (Play Store). The `production` profile defaults to `aab`.
- `developmentClient: true` in the EAS profile is what causes EAS to include `expo-dev-client` in the native build — without it you get a plain release build that cannot connect to Metro.
- Once a dev build is installed, you only need to rebuild when you add/remove native modules. JS changes hot-reload instantly via Metro.
