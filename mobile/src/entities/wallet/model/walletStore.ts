/**
 * entities/wallet/model/walletStore.ts
 *
 * Production Zustand store — SINGLE SOURCE OF TRUTH for wallet state.
 *
 * Features:
 * - expo-secure-store for encrypted persistence (auto-connect on restart)
 * - Tri-state connection status (disconnected | connecting | connected)
 * - Wallet name auto-detection and persistence
 * - Clean disconnect that wipes SecureStore
 * - Demo mode for offline/testing use
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

import type { ConnectionStatus, WalletName, WalletState } from './types';
import { SECURE_KEYS } from './types';

// ── Helper — SecureStore wrappers (expo-secure-store is sync on some
//    platforms but we treat it as async for correctness) ───────────────────────

async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function secureGet(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

async function secureDelete(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useWalletStore = create<WalletState>()((set, get) => ({
  // ── Initial state ─────────────────────────────────────────────────────────
  status: 'disconnected' as ConnectionStatus,
  publicKey: null,
  walletName: null,
  authToken: null,
  isDemoMode: false,

  // ── Derived ───────────────────────────────────────────────────────────────
  get isConnected() {
    return get().status === 'connected';
  },
  get isConnecting() {
    return get().status === 'connecting';
  },

  // ── Actions ───────────────────────────────────────────────────────────────

  setConnecting: () =>
    set({ status: 'connecting' }),

  connect: async (publicKey, walletName, authToken) => {
    // Persist to encrypted storage
    await secureSet(SECURE_KEYS.PUBLIC_KEY, publicKey);
    if (walletName) {
      await secureSet(SECURE_KEYS.WALLET_NAME, walletName);
    }
    if (authToken) {
      await secureSet(SECURE_KEYS.AUTH_TOKEN, authToken);
    }

    set({
      status: 'connected',
      publicKey,
      walletName,
      authToken: authToken ?? null,
      isDemoMode: false,
    });
  },

  disconnect: async () => {
    // Wipe encrypted storage
    await secureDelete(SECURE_KEYS.PUBLIC_KEY);
    await secureDelete(SECURE_KEYS.WALLET_NAME);
    await secureDelete(SECURE_KEYS.AUTH_TOKEN);

    set({
      status: 'disconnected',
      publicKey: null,
      walletName: null,
      authToken: null,
      isDemoMode: false,
    });
  },

  connectAsDemo: () =>
    set({
      status: 'connected',
      publicKey: null,
      walletName: null,
      authToken: null,
      isDemoMode: true,
    }),

  restoreSession: async () => {
    try {
      const savedKey = await secureGet(SECURE_KEYS.PUBLIC_KEY);
      const savedWallet = await secureGet(SECURE_KEYS.WALLET_NAME);
      const savedToken = await secureGet(SECURE_KEYS.AUTH_TOKEN);

      if (savedKey) {
        set({
          status: 'connected',
          publicKey: savedKey,
          walletName: (savedWallet as WalletName) ?? 'Solana Wallet',
          authToken: savedToken ?? null,
          isDemoMode: false,
        });
      }
    } catch {
      // Corrupted / first launch — silently ignore
      await secureDelete(SECURE_KEYS.PUBLIC_KEY).catch(() => {});
      await secureDelete(SECURE_KEYS.WALLET_NAME).catch(() => {});
      await secureDelete(SECURE_KEYS.AUTH_TOKEN).catch(() => {});
    }
  },
}));
