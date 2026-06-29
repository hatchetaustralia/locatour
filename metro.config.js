const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite's web build statically imports a `.wasm` module. We only use
// SQLite on native (web falls back to localStorage), but Metro still bundles
// the require() so the asset must resolve. Allow `.wasm` as an asset.
config.resolver.assetExts.push('wasm');

// Render `.svg` imports as React components via react-native-svg-transformer
// (so `import Stamp from './stamp.svg'` is a crisp, recolourable vector).
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts.push('svg');

// The Laravel API/admin lives in `backend/`. Metro must not crawl it
// (PHP vendor/, storage/, etc.) — it has nothing the Expo bundle needs and
// the file count slows/breaks the watcher. Block the whole directory.
// (blockList accepts a RegExp directly, so no metro-config helper needed.)
const backendDir = path.resolve(__dirname, 'backend').replace(/[/\\]/g, '[/\\\\]');
config.resolver.blockList = new RegExp(`${backendDir}[/\\\\].*`);

module.exports = config;
