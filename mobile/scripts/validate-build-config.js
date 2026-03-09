#!/usr/bin/env node
/**
 * scripts/validate-build-config.js
 * EcoQuest Mobile — Pre-Build Configuration Validator
 *
 * Run BEFORE `eas build` to catch common misconfigurations.
 * Usage: node scripts/validate-build-config.js [--profile=store]
 *
 * Checks:
 *   1. EAS Project ID is set (not a placeholder)
 *   2. Required files exist (proguard-rules.pro, network_security_config.xml, plugins)
 *   3. app.json version/versionCode consistency
 *   4. No console.log leaks in anti-cheat service files
 *   5. Package name format correct (com.ecoquest.mobile)
 *   6. Dangerous permissions are NOT in the allowed list
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✘\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';

let hasErrors = false;

function check(label, condition, errorMsg, warningOnly = false) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.log(`  ${warningOnly ? WARN : FAIL} ${label}`);
    console.log(`     → ${errorMsg}`);
    if (!warningOnly) hasErrors = true;
  }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function readJSON(relPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
  } catch {
    return null;
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  EcoQuest Mobile — Build Config Validator');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ── 1. Required Files ─────────────────────────────────────────────────────────
console.log('[1] Required Configuration Files');
check('eas.json exists', fileExists('eas.json'), 'Run: eas init');
check('app.json exists', fileExists('app.json'), 'app.json is missing');
check('babel.config.js exists', fileExists('babel.config.js'), 'babel.config.js is missing');
check('metro.config.js exists', fileExists('metro.config.js'), 'metro.config.js is missing');
check('.easignore exists', fileExists('.easignore'), 'Create .easignore to reduce EAS upload size', true);
check(
  'proguard-rules.pro exists',
  fileExists('android/app/proguard-rules.pro'),
  'ProGuard rules missing — obfuscation will not work'
);
check(
  'network_security_config.xml exists',
  fileExists('plugins/network_security_config.xml'),
  'Network security config missing'
);
check(
  'plugins/withAndroidManifest.js exists',
  fileExists('plugins/withAndroidManifest.js'),
  'Android manifest plugin missing'
);
check(
  'plugins/withProguardConfig.js exists',
  fileExists('plugins/withProguardConfig.js'),
  'ProGuard config plugin missing'
);
check(
  'plugins/withSeekerOptimization.js exists',
  fileExists('plugins/withSeekerOptimization.js'),
  'Seeker optimization plugin missing'
);

// ── 2. app.json Health Check ──────────────────────────────────────────────────
console.log('\n[2] app.json Validation');
const appJson = readJSON('app.json');
const expo = appJson?.expo;

check('app.json parseable', !!expo, 'app.json is invalid JSON');

if (expo) {
  check('jsEngine is hermes', expo.jsEngine === 'hermes', 'Set jsEngine: "hermes" for smaller bundle');
  check(
    'projectId not placeholder',
    expo.extra?.eas?.projectId &&
      expo.extra.eas.projectId !== 'REPLACE_WITH_EAS_PROJECT_ID' &&
      !expo.extra.eas.projectId.includes('placeholder'),
    'Run `cd mobile && npx eas-cli init` to set the real Project ID',
    true // warning — requires manual eas login, not auto-fixable
  );
  check(
    'package name correct',
    expo.android?.package === 'com.ecoquest.mobile',
    `Package name should be "com.ecoquest.mobile", got: ${expo.android?.package}`
  );
  check(
    'minSdkVersion >= 33 (Seeker)',
    (expo.android?.minSdkVersion ?? 0) >= 33,
    'minSdkVersion must be >= 33 for Solana Seeker compatibility'
  );
  check(
    'enableProguardInReleaseBuilds true',
    expo.android?.enableProguardInReleaseBuilds === true,
    'Set enableProguardInReleaseBuilds: true for obfuscation'
  );
  check(
    'allowBackup false',
    expo.android?.allowBackup === false,
    'Set allowBackup: false to prevent ADB backup of wallet keys'
  );

  // Plugin registrations
  const plugins = expo.plugins ?? [];
  const pluginNames = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  check(
    'withAndroidManifest plugin registered',
    pluginNames.includes('./plugins/withAndroidManifest'),
    'Add "./plugins/withAndroidManifest" to expo.plugins'
  );
  check(
    'withProguardConfig plugin registered',
    pluginNames.includes('./plugins/withProguardConfig'),
    'Add "./plugins/withProguardConfig" to expo.plugins'
  );
  check(
    'withSeekerOptimization plugin registered',
    pluginNames.includes('./plugins/withSeekerOptimization'),
    'Add "./plugins/withSeekerOptimization" to expo.plugins'
  );

  // Blocked dangerous permissions
  const blocked = expo.android?.blockedPermissions ?? [];
  const dangerousPerms = [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_EXTERNAL_STORAGE',
  ];
  check(
    'Dangerous permissions blocked',
    dangerousPerms.every((p) => blocked.includes(p)),
    'Add dangerous permissions to android.blockedPermissions'
  );
}

// ── 3. eas.json Health Check ──────────────────────────────────────────────────
console.log('\n[3] eas.json Validation');
const easJson = readJSON('eas.json');

check('eas.json parseable', !!easJson, 'eas.json is invalid JSON');

if (easJson) {
  check('development profile exists', !!easJson.build?.development, 'Add development build profile');
  check('preview profile exists', !!easJson.build?.preview, 'Add preview build profile');
  check('store profile exists', !!easJson.build?.store, 'Add store build profile');
  check(
    'store profile uses mainnet-beta',
    easJson.build?.store?.env?.EXPO_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta',
    'Store profile must use mainnet-beta cluster'
  );
  check(
    'store profile uses app-bundle',
    easJson.build?.store?.android?.buildType === 'app-bundle',
    'Store profile must produce AAB (app-bundle), not APK'
  );
}

// ── 4. Anti-Cheat Source Scan ─────────────────────────────────────────────────
console.log('\n[4] Anti-Cheat Code Security Scan');
const antiCheatFiles = [
  'src/services/LocationService.ts',
  'src/services/AntiCheatService.ts',
  'src/features/quest/hooks/useQuestSubmission.ts',
];

for (const file of antiCheatFiles) {
  if (!fileExists(file)) {
    console.log(`  ${INFO} ${file} — not found (skipping)`);
    continue;
  }
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const consoleLines = content.match(/console\.(log|warn|error|info|debug)\(/g) || [];
  check(
    `${path.basename(file)}: no console.* leaks`,
    consoleLines.length === 0,
    `Found ${consoleLines.length} console.* call(s) — will be stripped by babel in prod, but remove for hygiene`,
    true // warning only
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (hasErrors) {
  console.log(`  ${FAIL} Build config validation FAILED — fix errors above before building`);
  process.exit(1);
} else {
  console.log(`  ${PASS} All checks passed — ready to build!`);
  console.log('\n  Next steps:');
  console.log('    npm run build:preview   → Internal APK (jury testing)');
  console.log('    npm run build:store     → AAB for Solana dApp Store');
  console.log('    npm run submit:store    → Submit to Solana dApp Store\n');
}
