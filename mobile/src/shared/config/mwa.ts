/**
 * shared/config/mwa.ts
 * Mobile Wallet Adapter configuration — SMS 2.0 + offline-first
 */

export const MWA_CONFIG = {
  /** App identity shown in wallet UI */
  appIdentity: {
    name: 'EcoQuest',
    uri: 'https://ecoquest.app',
    // Icon must be an absolute URL for MWA verification.
    icon: 'https://ecoquest.app/icon.png',
  },

  /** Auth token expiry — 24h */
  authTokenLifespan: 24 * 60 * 60 * 1000,

  /** Cluster for MWA session — 🔒 HACKATHON: Locked to Devnet */
  cluster: 'devnet' as const,
} as const;

/**
 * Offline-first mode:
 * When no wallet is available (e.g., emulator without Seed Vault),
 * the app falls back to a read-only mode with mock signing.
 * Transactions are queued and submitted when wallet reconnects.
 */
export const OFFLINE_FIRST_CONFIG = {
  /** Enable offline-first mode in dev/test */
  enabled: process.env.EXPO_PUBLIC_OFFLINE_FIRST === 'true' || __DEV__,

  /** Max queued transactions before warning user */
  maxQueueSize: 10,

  /** Retry interval for queued transactions (ms) */
  retryIntervalMs: 5_000,
} as const;
