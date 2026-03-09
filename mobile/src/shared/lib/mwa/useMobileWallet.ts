/**
 * shared/lib/mwa/useMobileWallet.ts
 * MWA SMS 2.0 hook — offline-first, Seed Vault optimized
 *
 * Architecture:
 * - Online: Uses @solana-mobile/mobile-wallet-adapter-protocol-web3js
 * - Offline/Dev: Falls back to mock signer, queues txs for later
 *
 * Auth flow:
 * - On connect: try reauthorize with stored auth_token first
 * - If reauthorize fails (expired / revoked): fall back to authorize
 * - On signAndSendTransaction: reauthorize inside transact to avoid pop-ups
 */
import { useCallback, useRef } from 'react';
import {
  transact,
  Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {
  Transaction,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';

import { MWA_CONFIG, OFFLINE_FIRST_CONFIG } from '../../config/mwa';
import { useWalletStore } from '../../../entities/wallet/model/walletStore';
import { toPublicKeyFromBase64 } from './mwaAddress';

type SignAndSendResult = { signature: string };

export function useMobileWallet() {
  const storeConnect = useWalletStore((s) => s.connect);
  const storeDisconnect = useWalletStore((s) => s.disconnect);
  const storeSetConnecting = useWalletStore((s) => s.setConnecting);
  const getAuthToken = () => useWalletStore.getState().authToken;
  const pendingTxQueue = useRef<Transaction[]>([]);

  // ── Connect ──────────────────────────────────────────────────────────────
  // Try reauthorize first (no pop-up), fall back to authorize if token invalid.

  const connect = useCallback(async (): Promise<PublicKey | null> => {
    try {
      storeSetConnecting();
      return await transact(async (wallet: Web3MobileWallet) => {
        const existingToken = getAuthToken();

        let authResult: any;

        // Try reauthorize with saved token — avoids pop-up
        if (existingToken) {
          try {
            authResult = await wallet.reauthorize({
              auth_token: existingToken,
              identity: MWA_CONFIG.appIdentity,
            });
          } catch {
            // Token expired or revoked → fall through to authorize
            authResult = null;
          }
        }

        // No saved token or reauthorize failed → full authorize (shows pop-up once)
        if (!authResult) {
          authResult = await wallet.authorize({
            cluster: MWA_CONFIG.cluster,
            identity: MWA_CONFIG.appIdentity,
          });
        }

        // MWA returns Base64-encoded addresses, decode to PublicKey
        const pubkey = toPublicKeyFromBase64(authResult.accounts[0].address);
        await storeConnect(pubkey.toBase58(), 'Solana Wallet', authResult.auth_token);
        return pubkey;
      });
    } catch (error) {
      if (OFFLINE_FIRST_CONFIG.enabled) {
        console.warn('[MWA] No wallet found, entering offline-first mode');
        const devPubkey = new PublicKey('11111111111111111111111111111111');
        // Don't mark as connected in offline mode
        return devPubkey;
      }
      await storeDisconnect();
      throw error;
    }
  }, [storeConnect, storeDisconnect, storeSetConnecting]);

  // ── Disconnect ───────────────────────────────────────────────────────────

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      const token = getAuthToken();
      await transact(async (wallet: Web3MobileWallet) => {
        await wallet.deauthorize({ auth_token: token ?? '' });
      });
    } catch {
      // Ignore errors on disconnect
    } finally {
      await storeDisconnect();
    }
  }, [storeDisconnect]);

  // ── Sign & Send Transaction ──────────────────────────────────────────────
  // Uses reauthorize inside transact to maintain session without pop-ups.

  const signAndSendTransaction = useCallback(
    async (transaction: Transaction): Promise<SignAndSendResult> => {
      if (OFFLINE_FIRST_CONFIG.enabled) {
        // Queue transaction for later
        pendingTxQueue.current.push(transaction);
        console.warn('[MWA] Offline mode: transaction queued', {
          queueSize: pendingTxQueue.current.length,
        });
        return { signature: 'OFFLINE_QUEUED_' + Date.now() };
      }

      return await transact(async (wallet: Web3MobileWallet) => {
        const existingToken = getAuthToken();

        // Reauthorize within transact session — no extra pop-up
        if (existingToken) {
          try {
            const reAuthResult = await wallet.reauthorize({
              auth_token: existingToken,
              identity: MWA_CONFIG.appIdentity,
            });
            // Update stored token (it may rotate)
            if (reAuthResult.auth_token && reAuthResult.auth_token !== existingToken) {
              await storeConnect(
                toPublicKeyFromBase64(reAuthResult.accounts[0].address).toBase58(),
                'Solana Wallet',
                reAuthResult.auth_token,
              );
            }
          } catch {
            // Token invalid — do a fresh authorize
            await wallet.authorize({
              cluster: MWA_CONFIG.cluster,
              identity: MWA_CONFIG.appIdentity,
            });
          }
        } else {
          // No token at all — do a fresh authorize
          const authResult = await wallet.authorize({
            cluster: MWA_CONFIG.cluster,
            identity: MWA_CONFIG.appIdentity,
          });
          await storeConnect(
            toPublicKeyFromBase64(authResult.accounts[0].address).toBase58(),
            'Solana Wallet',
            authResult.auth_token,
          );
        }

        const [signature] = await wallet.signAndSendTransactions({
          transactions: [transaction],
        });
        return { signature };
      });
    },
    [storeConnect],
  );

  // ── Flush Queued Transactions ────────────────────────────────────────────

  const flushPendingTransactions = useCallback(async (): Promise<void> => {
    if (pendingTxQueue.current.length === 0) return;

    const queue = [...pendingTxQueue.current];
    pendingTxQueue.current = [];

    await transact(async (wallet: Web3MobileWallet) => {
      const existingToken = getAuthToken();
      if (existingToken) {
        try {
          await wallet.reauthorize({
            auth_token: existingToken,
            identity: MWA_CONFIG.appIdentity,
          });
        } catch {
          await wallet.authorize({
            cluster: MWA_CONFIG.cluster,
            identity: MWA_CONFIG.appIdentity,
          });
        }
      } else {
        await wallet.authorize({
          cluster: MWA_CONFIG.cluster,
          identity: MWA_CONFIG.appIdentity,
        });
      }
      await wallet.signAndSendTransactions({ transactions: queue });
    });
  }, []);

  return {
    connect,
    disconnect,
    signAndSendTransaction,
    flushPendingTransactions,
    pendingCount: pendingTxQueue.current.length,
  };
}
