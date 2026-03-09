// babel.config.js
// EcoQuest Mobile — Babel Configuration
//
// Production optimizations:
//   - transform-remove-console: strips all console.* calls in production
//   - react-native-reanimated: must be LAST plugin (Reanimated requirement)
//   - module-resolver: clean imports via @/ alias

module.exports = function (api) {
  api.cache(true);

  const isProduction = process.env.NODE_ENV === 'production' ||
                       process.env.BABEL_ENV === 'production';

  const plugins = [
    // ── Path Aliases ────────────────────────────────────────────────────────
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@hooks': './src/hooks',
          '@screens': './src/screens',
          '@features': './src/features',
          '@services': './src/services',
          '@shared': './src/shared',
          '@assets': './assets',
        },
      },
    ],

    // ── Production: Strip All Console Calls ─────────────────────────────────
    // Removes console.log/warn/error/info/debug from the production bundle.
    // Prevents leaking internal state, GPS coordinates, or anti-cheat
    // logic details through debug output.
    ...(isProduction
      ? [
          [
            'transform-remove-console',
            {
              // Remove ALL console methods in production
              exclude: [],
            },
          ],
        ]
      : []),

    // ── Reanimated (MUST be last) ────────────────────────────────────────────
    // react-native-reanimated/plugin must always be the final plugin.
    // It transforms worklet functions to run on the UI thread.
    'react-native-reanimated/plugin',
  ];

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'react',
        },
      ],
    ],
    plugins,
  };
};
