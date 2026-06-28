// CNG config plugin: pin which CPU architectures (ABIs) the Android build packages.
//
// android/ is gitignored (Continuous Native Generation), so a raw gradle.properties
// edit is wiped on every `expo prebuild` / EAS build. This plugin sets
// `reactNativeArchitectures` during prebuild so it actually sticks.
//
// Default "arm64-v8a" = every modern real Android phone (~2017+). Dropping
// armeabi-v7a (old 32-bit), x86 and x86_64 (emulators) takes the universal APK from
// ~180 MB to ~60 MB. Fine for real-device field testing; the trade-off is you can't
// install on an x86 emulator or a very old 32-bit-only phone.
//
// To restore all architectures, pass a different list (e.g. "armeabi-v7a,arm64-v8a,
// x86,x86_64") as the plugin arg in app.json, or remove this plugin entirely.
const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withAndroidAbis(config, abis = 'arm64-v8a') {
  return withGradleProperties(config, (cfg) => {
    const key = 'reactNativeArchitectures';
    const existing = cfg.modResults.find((p) => p.type === 'property' && p.key === key);
    if (existing) {
      existing.value = abis;
    } else {
      cfg.modResults.push({ type: 'property', key, value: abis });
    }
    return cfg;
  });
};
