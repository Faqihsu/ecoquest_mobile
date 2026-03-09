/**
 * entities/wallet/model/types.ts
 *
 * Production wallet state types — single source of truth.
 */

/** Tri-state connection status for clear UI representation */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/** Known wallet names; null when no wallet is connected */
export type WalletName =
  | 'Phantom'
  | 'Backpack'
  | 'Jupiter'
  | 'Seeker'
  | 'Solana Wallet'
  | null;

/** Secure storage keys */
export const SECURE_KEYS = {
  PUBLIC_KEY: 'ecoquest_wallet_publicKey',
  WALLET_NAME: 'ecoquest_wallet_name',
  AUTH_TOKEN: 'ecoquest_wallet_authToken',
} as const;

/** Full wallet state shape (Zustand store) */
export interface WalletState {
  // ── Data ────────────────────────────────────────────────────────────────────
  status: ConnectionStatus;
  publicKey: string | null;
  walletName: WalletName;
  authToken: string | null;
  isDemoMode: boolean;

  // ── Derived (computed getters for convenience) ──────────────────────────────
  /** Shorthand: status === 'connected' */
  isConnected: boolean;
  /** Shorthand: status === 'connecting' */
  isConnecting: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────────
  /** Transition to 'connecting' state */
  setConnecting: () => void;

  /**
   * Save a successful wallet connection.
   * Persists publicKey + walletName to SecureStore.
   */
  connect: (
    publicKey: string,
    walletName: WalletName,
    authToken?: string,
  ) => Promise<void>;

  /**
   * Clear wallet session — SecureStore + in-memory state.
   */
  disconnect: () => Promise<void>;

  /** Enter demo mode (no real wallet) */
  connectAsDemo: () => void;

  /**
   * Restore persisted session from SecureStore on app launch.
   * Called once during app init.
   */
  restoreSession: () => Promise<void>;
}
