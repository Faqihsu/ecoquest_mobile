/**
 * plugins/withAndroidManifest.js
 *
 * Expo Config Plugin — Android Manifest Hardening
 *
 * Applies security and dApp Store compliance changes to AndroidManifest.xml:
 *   1. Enforce required hardware features (camera + GPS)
 *   2. Remove dangerous/unnecessary permissions
 *   3. Set allowBackup=false (prevent wallet key exposure via ADB backup)
 *   4. Set networkSecurityConfig (HTTPS-only)
 *   5. Add Solana Mobile dApp Store metadata
 */

const { withAndroidManifest } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMainApplication(manifest) {
  return manifest.manifest.application[0];
}

function getManifestRoot(manifest) {
  return manifest.manifest;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const withEcoQuestAndroidManifest = (config) => {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const root = getManifestRoot(manifest);
    const application = getMainApplication(manifest);

    // ── 1. Required Hardware Features ─────────────────────────────────────────
    // These tell the Play Store / dApp Store that camera + GPS are mandatory.
    // Devices without these features will not see the app in search results.
    if (!root['uses-feature']) root['uses-feature'] = [];

    const requiredFeatures = [
      { $: { 'android:name': 'android.hardware.camera', 'android:required': 'true' } },
      { $: { 'android:name': 'android.hardware.camera.autofocus', 'android:required': 'false' } },
      { $: { 'android:name': 'android.hardware.location', 'android:required': 'true' } },
      { $: { 'android:name': 'android.hardware.location.gps', 'android:required': 'true' } },
    ];

    for (const feature of requiredFeatures) {
      const name = feature.$['android:name'];
      const exists = root['uses-feature'].some((f) => f.$['android:name'] === name);
      if (!exists) root['uses-feature'].push(feature);
    }

    // ── 2. Remove Dangerous / Unnecessary Permissions ─────────────────────────
    const BLOCKED_PERMISSIONS = new Set([
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.MANAGE_EXTERNAL_STORAGE',
    ]);

    if (root['uses-permission']) {
      root['uses-permission'] = root['uses-permission'].filter((perm) => {
        const name = perm.$['android:name'];
        if (BLOCKED_PERMISSIONS.has(name)) {
          console.log(`[withAndroidManifest] Removed permission: ${name}`);
          return false;
        }
        return true;
      });
    }

    // ── 3. Application-level Security Attributes ──────────────────────────────
    // allowBackup=false: prevents ADB backup from exposing wallet keys
    // networkSecurityConfig: enforces HTTPS-only (required for dApp Store)
    // NOTE: android:debuggable is intentionally NOT set here.
    // The Android Gradle Plugin (AGP) manages debuggable automatically:
    //   - release builds: debuggable=false (enforced by AGP)
    //   - debug builds: debuggable=true
    // Setting it manually in the manifest causes a ManifestMerger error in release builds.
    application.$['android:allowBackup'] = 'false';
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    // ── 4. Solana Mobile dApp Store Metadata ──────────────────────────────────
    // Required for listing on the Solana Mobile dApp Store
    if (!application['meta-data']) application['meta-data'] = [];

    const dappStoreMetadata = [
      {
        $: {
          'android:name': 'com.solanamobile.seedvault.WALLET_ADAPTER_COMPATIBLE',
          'android:value': 'true',
        },
      },
      {
        $: {
          'android:name': 'com.solanamobile.dappstore.CATEGORY',
          'android:value': 'defi',
        },
      },
    ];

    for (const meta of dappStoreMetadata) {
      const name = meta.$['android:name'];
      const exists = application['meta-data'].some((m) => m.$['android:name'] === name);
      if (!exists) application['meta-data'].push(meta);
    }

    // ── 5. Copy network_security_config.xml to Android res ───────────────────
    // The file must exist at android/app/src/main/res/xml/
    const xmlResDir = path.join(
      config.modRequest.projectRoot,
      'android',
      'app',
      'src',
      'main',
      'res',
      'xml'
    );
    const srcFile = path.join(config.modRequest.projectRoot, 'plugins', 'network_security_config.xml');
    const destFile = path.join(xmlResDir, 'network_security_config.xml');

    if (fs.existsSync(srcFile)) {
      fs.mkdirSync(xmlResDir, { recursive: true });
      fs.copyFileSync(srcFile, destFile);
      console.log('[withAndroidManifest] Copied network_security_config.xml to android/res/xml/');
    }

    return config;
  });
};

module.exports = withEcoQuestAndroidManifest;
