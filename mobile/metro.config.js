// metro.config.js
// EcoQuest Mobile — Metro Bundler Configuration
//
// Optimizations:
//   - inlineRequires: lazy-load modules (smaller initial JS bundle)
//   - minifierConfig: aggressive terser compression for release builds
//   - drop_console: strip all console.* calls from production bundle
//   - Tree-shaking via minifier dead-code elimination
//   - Exclude test files and dev-only modules from bundle

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ── Resolver ──────────────────────────────────────────────────────────────────
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs', 'mjs',
];

// Exclude test files from bundle
config.resolver.blockList = [
  /.*\/__tests__\/.*/,
  /.*\.test\.(ts|tsx|js|jsx)$/,
  /.*\.spec\.(ts|tsx|js|jsx)$/,
  /.*\/node_modules\/.*\/test\/.*/,
];

// ── Transformer ───────────────────────────────────────────────────────────────
config.transformer = {
  ...config.transformer,

  // Hermes-compatible minifier
  minifierPath: 'metro-minify-terser',

  minifierConfig: {
    // Terser options — aggressive for production
    compress: {
      // Strip all console.* calls
      drop_console: true,
      drop_debugger: true,

      // Dead code elimination
      dead_code: true,
      unused: true,

      // Aggressive inlining
      inline: 3,
      passes: 3,

      // Remove unreachable code
      conditionals: true,
      evaluate: true,
      booleans: true,

      // Collapse single-use variables
      collapse_vars: true,
      reduce_vars: true,

      // Pure function annotations
      pure_getters: true,
      pure_funcs: [
        'console.log',
        'console.info',
        'console.debug',
        'console.warn',
        'console.error',
      ],
    },
    mangle: {
      // Mangle (shorten) local variable names
      toplevel: false, // Keep top-level names for RN bridge compatibility
      keep_fnames: false,
    },
    output: {
      // Remove comments from output
      comments: false,
      // ASCII-only output (safer for some Android environments)
      ascii_only: true,
    },
  },

  // Inline requires: modules are loaded lazily on first use
  // This significantly reduces startup time and initial bundle parse
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// ── Server ────────────────────────────────────────────────────────────────────
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => middleware,
};

module.exports = config;
