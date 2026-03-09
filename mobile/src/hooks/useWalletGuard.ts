/**
 * useWalletGuard.ts — Wallet Disconnect Listener & Session Guard
 *
 * Monitors wallet connection health and forces app back to Login
 * screen when disconnect is detected. Cleans all sensitive state.
 *
 * Detection layers:
 *   1. AppState listener — when app returns to foreground, re-validate
 *      the MWA session by checking if the wallet is still authorized
 *   2. Zustand subscription — listen for external disconnect events
 *   3. Manual disconnect — cleanup React Query cache + in-memory state
 *
 * On disconnect:
 *   ✓ Zustand store → status='disconnected', publicKey=null
 *   ✓ SecureStore → wiped (publicKey, walletName)
 *   ✓ React Query cache → fully cleared
 *   ✓ Navigation → auto-returns to WalletConnect (via App.tsx guard)
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { useWalletStore } from '../entities/wallet/model/walletStore';
import { MWA_CONFIG } from '../shared/config/mwa';
import { invalidateConnectionCache } from '../shared/lib/rpcConnection';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WalletGuardOptions {
  /** Enable re-authorization check on foreground (default: true) */
  checkOnForeground?: boolean;
  /** Show alert when session expires (default: true) */
  showAlert?: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Call this hook once in a top-level navigation component (e.g., App.tsx).
 *
 * It monitors the wallet session and triggers full cleanup when
 * disconnect is detected from any source.
 */
export function useWalletGuard(options: WalletGuardOptions = {}): void {
  const { checkOnForeground = true, showAlert = true } = options;

  const queryClient = useQueryClient();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const isChecking = useRef(false);
  // Cooldown: skip re-auth check for 5s after connection state changes
  // This prevents the loop where returning from wallet app triggers re-auth
  const lastConnectTime = useRef<number>(0);
  const REAUTH_COOLDOWN_MS = 5000;

  const status = useWalletStore((s) => s.status);
  const publicKey = useWalletStore((s) => s.publicKey);
  const isDemoMode = useWalletStore((s) => s.isDemoMode);
  const authToken = useWalletStore((s) => s.authToken);
  const storeDisconnect = useWalletStore((s) => s.disconnect);

  // ── Full cleanup function ───────────────────────────────────────────────

  const performFullCleanup = useCallback(
    async (reason: string, silent = false) => {
      console.log(`[WalletGuard] Disconnect triggered: ${reason}`);

      // 1. Wipe Zustand state + SecureStore
      await storeDisconnect();

      // 2. Clear all React Query caches (balances, staker info, quests, etc.)
      queryClient.clear();

      // 3. Invalidate RPC connection cache
      invalidateConnectionCache();

      // 4. Show user-facing alert (unless silent)
      if (!silent && showAlert) {
        Alert.alert(
          '🔌 Wallet Disconnected',
          reason,
          [{ text: 'OK', style: 'default' }],
        );
      }

      // Navigation automatically returns to WalletConnect screen
      // because App.tsx renders based on `!connected` state
    },
    [storeDisconnect, queryClient, showAlert],
  );

  // ── Layer 1: AppState listener (foreground check) ──────────────────────

  useEffect(() => {
    if (!checkOnForeground) return;

    const subscription = AppState.addEventListener(
      'change',
      async (nextState: AppStateStatus) => {
        const wasBg = appState.current.match(/inactive|background/);
        const isNowFg = nextState === 'active';
        appState.current = nextState;

        // Only check when coming BACK to foreground AND was connected
        if (!wasBg || !isNowFg) return;
        if (status !== 'connected' || !publicKey || isDemoMode) return;

        // Skip re-auth if connection just happened (prevents loop)
        if (Date.now() - lastConnectTime.current < REAUTH_COOLDOWN_MS) {
          console.log('[WalletGuard] Skipping re-auth (cooldown active)');
          return;
        }
        if (isChecking.current) return;

        isChecking.current = true;

        try {
          // Try reauthorize first (cached token — no wallet pop-up)
          // Fall back to authorize only if token expired/missing
          await transact(async (wallet) => {
            try {
              if (authToken) {
                await wallet.reauthorize({
                  auth_token: authToken,
                  identity: MWA_CONFIG.appIdentity,
                });
              } else {
                throw new Error('No auth token');
              }
            } catch {
              await wallet.authorize({
                cluster: MWA_CONFIG.cluster,
                identity: MWA_CONFIG.appIdentity,
              });
            }
          });

          // Re-auth succeeded — wallet is still connected
          console.log('[WalletGuard] Session still valid after foreground');
        } catch (err: any) {
          const msg = err?.message ?? '';
          const isDisconnect =
            msg.includes('not found') ||
            msg.includes('declined') ||
            msg.includes('cancelled') ||
            msg.includes('Unable to resolve') ||
            msg.includes('RESOLVE_ACTIVITY') ||
            msg.includes('No wallet') ||
            msg.includes('Activity not found');

          if (isDisconnect) {
            await performFullCleanup(
              'Wallet session expired or was revoked. Please reconnect.',
            );
          }
          // Other errors (user just cancelled the prompt) — ignore silently
        } finally {
          isChecking.current = false;
        }
      },
    );

    return () => subscription.remove();
  }, [checkOnForeground, status, publicKey, isDemoMode, authToken, performFullCleanup]);

  // ── Layer 2: Zustand state watcher ─────────────────────────────────────
  // If something externally sets status to 'disconnected' (e.g., another
  // hook or manual call), ensure cleanup runs

  const prevStatus = useRef(status);

  useEffect(() => {
    if (prevStatus.current !== 'connected' && status === 'connected') {
      // Just connected — record timestamp for cooldown
      lastConnectTime.current = Date.now();
      console.log('[WalletGuard] Connection detected — cooldown started');
    }
    if (prevStatus.current === 'connected' && status === 'disconnected') {
      // State transitioned to disconnected — clear caches
      queryClient.clear();
      invalidateConnectionCache();
      console.log('[WalletGuard] State change detected: connected → disconnected. Caches cleared.');
    }
    prevStatus.current = status;
  }, [status, queryClient]);
}
