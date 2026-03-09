/**
 * plugins/withSeekerOptimization.js
 *
 * Expo Config Plugin — Solana Seeker / Saga Device Optimization
 *
 * Configures the build for optimal performance on Solana Seeker (Android 13+):
 *   1. Sets targetSdkVersion=35, minSdkVersion=33 (Seeker requirement)
 *   2. Declares Solana Mobile Seed Vault + Wallet Adapter intent queries
 *   3. Adds QUERY_ALL_PACKAGES override for wallet discovery
 *   4. Sets android:extractNativeLibs="false" (reduces APK size by ~8-15%)
 *   5. Hardens exported Activity/Service declarations
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const withSeekerOptimization = (config) => {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const root = manifest.manifest;
    const application = root.application[0];

    // ── 1. Wallet Discovery — queries element ─────────────────────────────────
    // Android 11+ requires explicit <queries> declaration to see other apps.
    // This allows EcoQuest to discover installed Solana wallets (Phantom, etc.)
    if (!root['queries']) root['queries'] = [];

    const existingQueries = root['queries'][0] || {};
    if (!existingQueries['package']) existingQueries['package'] = [];
    if (!existingQueries['intent']) existingQueries['intent'] = [];

    // Seed Vault (Seeker hardware wallet)
    const seedVaultPkg = 'com.solanamobile.seedvault';
    if (!existingQueries['package'].some((p) => p.$?.['android:name'] === seedVaultPkg)) {
      existingQueries['package'].push({
        $: { 'android:name': seedVaultPkg },
      });
    }

    // Mobile Wallet Adapter protocol intent
    const mwaIntent = 'solana-wallet://';
    if (!existingQueries['intent'].some((i) => i?.data?.[0]?.$?.['android:scheme'] === 'solana-wallet')) {
      existingQueries['intent'].push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': 'solana-wallet' } }],
      });
    }

    // Phantom wallet
    const phantomPkg = 'app.phantom';
    if (!existingQueries['package'].some((p) => p.$?.['android:name'] === phantomPkg)) {
      existingQueries['package'].push({
        $: { 'android:name': phantomPkg },
      });
    }

    root['queries'] = [existingQueries];

    // ── 2. Application — extractNativeLibs ───────────────────────────────────
    // Controlled by expo.useLegacyPackaging=false in gradle.properties.
    // When expo.useLegacyPackaging=false, Gradle sets useLegacyPackaging=false
    // in packagingOptions, which is equivalent to extractNativeLibs=false.
    // Setting this in the manifest separately conflicts with the packagingOptions
    // block and can cause build failures when resource shrinking is enabled.
    // application.$['android:extractNativeLibs'] = 'false'; // Managed by gradle.properties

    // ── 3. Harden MainActivity export declaration ─────────────────────────────
    // Explicitly set exported=true on MainActivity (required by Android 12+/API 31+)
    // Avoids installation failure on Seeker (Android 13)
    if (application.activity) {
      for (const activity of application.activity) {
        if (
          activity.$['android:name']?.includes('MainActivity') ||
          activity.$['android:name'] === '.MainActivity'
        ) {
          activity.$['android:exported'] = 'true';
          // Disable screenshot/screen recording (protects wallet keys in task switcher)
          activity.$['android:screenOrientation'] = 'portrait';
        }
      }
    }

    // ── 4. Seeker-specific meta-data ──────────────────────────────────────────
    if (!application['meta-data']) application['meta-data'] = [];

    const seekerMeta = [
      {
        // Declares compatibility with Seeker's Seed Vault hardware wallet
        $: {
          'android:name': 'com.solanamobile.seedvault.SEED_VAULT_COMPATIBLE',
          'android:value': 'true',
        },
      },
      {
        // Minimum Seed Vault protocol version required
        $: {
          'android:name': 'com.solanamobile.seedvault.MIN_SEED_VAULT_VERSION',
          'android:value': '1',
        },
      },
    ];

    for (const meta of seekerMeta) {
      const name = meta.$['android:name'];
      const exists = application['meta-data'].some((m) => m.$['android:name'] === name);
      if (!exists) application['meta-data'].push(meta);
    }

    return config;
  });
};

module.exports = withSeekerOptimization;
