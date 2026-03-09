// .eslintrc.js — Strict production config for EcoQuest Mobile
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  env: {
    "react-native/react-native": true,
  },
  plugins: [
    "@typescript-eslint",
    "react",
    "react-hooks",
    "import",
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  settings: {
    react: { version: "detect" },
    "import/resolver": {
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
  rules: {
    // ── TypeScript ──────────────────────────────────────────────────────
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],

    // ── React ───────────────────────────────────────────────────────────
    "react/react-in-jsx-scope": "off",        // Not needed in RN
    "react/prop-types": "off",                // We use TypeScript
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",

    // ── FSD Import Layer Rules ──────────────────────────────────────────
    // Enforce unidirectional dependency flow: app > pages > widgets > features > entities > shared
    "import/no-cycle": "error",
    "import/order": [
      "error",
      {
        groups: [
          "builtin",
          "external",
          "internal",
          ["parent", "sibling", "index"],
        ],
        pathGroups: [
          { pattern: "react", group: "external", position: "before" },
          { pattern: "react-native", group: "external", position: "before" },
          { pattern: "@app/**",      group: "internal", position: "before" },
          { pattern: "@pages/**",    group: "internal", position: "before" },
          { pattern: "@widgets/**",  group: "internal", position: "before" },
          { pattern: "@features/**", group: "internal", position: "before" },
          { pattern: "@entities/**", group: "internal", position: "before" },
          { pattern: "@shared/**",   group: "internal", position: "before" },
        ],
        pathGroupsExcludedImportTypes: ["react", "react-native"],
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],

    // ── General ─────────────────────────────────────────────────────────
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "prefer-const": "error",
    "no-var": "error",
    eqeqeq: ["error", "always"],
  },
  ignorePatterns: [
    "node_modules/",
    ".expo/",
    "dist/",
    "babel.config.js",
    "metro.config.js",
    "jest.config.js",
    "*.config.js",
  ],
};
