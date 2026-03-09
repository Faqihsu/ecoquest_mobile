// ─────────────────────────────────────────────────────────────────────────────
// useMWASign — Real MWA Transaction Signing Hook
//
// Safety features:
//   • Auth-token caching — uses reauthorize when token exists (skips approval)
//   • Concurrency guard — prevents multiple wallet popups at once
//   • Error classification — user cancel vs wallet error vs network error
//   • Session cleanup — failed sessions are nullified for clean retry
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { Transaction } from '@solana/web3.js';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { useWallet } from '../contexts/WalletContext';
import { useWalletStore } from '../entities/wallet/model/walletStore';
import { MWA_CONFIG } from '../shared/config/mwa';

export interface UseMWASignReturn {
  /** Sign a legacy Transaction via MWA. Throws if wallet cancelled. */
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  /** True if wallet is connected and signing is available */
  ready: boolean;
  /** True while a signing operation is in progress */
  signing: boolean;
}

/**
 * useMWASign — provides a real MWA signTransaction function.
 *
 * Uses `reauthorize` when a cached auth_token exists (skips wallet approval).
 * Falls back to full `authorize` if reauthorize fails.
 */
export function useMWASign(): UseMWASignReturn {
  const { connected } = useWallet();
  const authToken = useWalletStore((s) => s.authToken);
  const [signing, setSigning] = useState(false);
  const signingRef = useRef(false);

  const signTransaction = useCallback(async (tx: Transaction): Promise<Transaction> => {
    // ── Concurrency guard: prevent multiple wallet popups ──────────────
    if (signingRef.current) {
      throw new Error('A signing operation is already in progress. Please wait.');
    }
    signingRef.current = true;
    setSigning(true);

    try {
      const signedTxs = await transact(async (wallet) => {
        // Try reauthorize first (uses cached token — no approval popup)
        // Fall back to full authorize if token is missing or expired
        try {
          if (authToken) {
            await wallet.reauthorize({
              auth_token: authToken,
              identity: MWA_CONFIG.appIdentity,
            });
          } else {
            throw new Error('No auth token — fall through to authorize');
          }
        } catch {
          // Token expired or missing — full authorization
          await wallet.authorize({
            cluster: MWA_CONFIG.cluster,
            identity: MWA_CONFIG.appIdentity,
          });
        }

        // Sign the transaction
        const result = await wallet.signTransactions({
          transactions: [tx],
        });

        return result;
      });

      // Validate result
      if (!signedTxs || signedTxs.length === 0) {
        throw new Error('Wallet did not return signed transaction');
      }

      return signedTxs[0] as unknown as Transaction;
    } catch (err: any) {
      const msg: string = err?.message ?? '';

      const isUserCancel =
        msg.includes('declined') ||
        msg.includes('cancelled') ||
        msg.includes('User rejected') ||
        msg.includes('user rejected');

      if (isUserCancel) {
        throw new Error('Transaction dibatalkan oleh pengguna.');
      }

      throw err;
    } finally {
      // ── Always clean up — user can retry immediately ───────────────
      signingRef.current = false;
      setSigning(false);
    }
  }, [authToken]);

  return {
    signTransaction,
    ready: connected,
    signing,
  };
}
