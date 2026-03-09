// ─────────────────────────────────────────────────────────────────────────────
// useAccountWatcher — Real-time Balance Watcher via onAccountChange
//
// Uses @solana/web3.js `onAccountChange` (WebSocket subscription) to watch:
//   1. Native SOL balance (user's system account)
//   2. SKR token balance  (user's Associated Token Account)
//   3. Staker PDA account (staked amount + last claim timestamp)
//
// When any of these accounts change on-chain, the React Query cache is
// updated DIRECTLY (not invalidated) for zero-latency UI updates.
//
// This is the fastest possible sync:
//   on-chain change → validator → WebSocket push → cache set → UI re-render
//   (typically < 1 second after block confirmation)
//
// The hook cleanly unsubscribes when the component unmounts or wallet changes.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from 'react';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  AccountInfo,
} from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useQueryClient } from '@tanstack/react-query';

import { solanaKeys, type TokenBalanceResult } from '../shared/api/solanaQueries';
import { HELIUS_WS_URL, SKR_MINT_ADDRESS, SKR_DECIMALS } from '../shared/config/constants';
import { deriveStakingPDAs } from '../services/StakingService';

// ── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionEntry {
  id: number;
  label: string;
}

// ── WebSocket-Enabled Connection ─────────────────────────────────────────────
// The main RPC connection (`shared/api/solana.ts`) disables WebSocket.
// We need a separate connection with WS endpoint for onAccountChange.

let _wsConnection: Connection | null = null;

function getWsConnection(): Connection {
  if (!_wsConnection) {
    // Use HELIUS_WS_URL which already points to the correct endpoint
    // Derive HTTP URL from WS URL for the Connection constructor
    const httpUrl = HELIUS_WS_URL
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');

    _wsConnection = new Connection(httpUrl, {
      commitment: 'confirmed',
      wsEndpoint: HELIUS_WS_URL,
    });

    console.log('[AccountWatcher] WS connection created');
  }
  return _wsConnection;
}

// ── Account Data Parsers ─────────────────────────────────────────────────────

function parseSOLBalance(accountInfo: AccountInfo<Buffer>): number {
  return accountInfo.lamports / LAMPORTS_PER_SOL;
}

function parseSKRBalance(accountInfo: AccountInfo<Buffer>): TokenBalanceResult {
  try {
    const data = accountInfo.data;
    // SPL Token Account layout: 32(mint) + 32(owner) + 8(amount) + ...
    if (data.length < 72) {
      return { balance: 0, uiAmountString: '0', decimals: SKR_DECIMALS };
    }

    // Amount is at offset 64 (after mint + owner), 8 bytes LE u64
    const rawAmount = data.readBigUInt64LE(64);
    const balance = Number(rawAmount) / (10 ** SKR_DECIMALS);

    return {
      balance,
      uiAmountString: balance.toFixed(SKR_DECIMALS),
      decimals: SKR_DECIMALS,
    };
  } catch {
    return { balance: 0, uiAmountString: '0', decimals: SKR_DECIMALS };
  }
}

function parseStakerAccount(accountInfo: AccountInfo<Buffer>): {
  stakedAmount: number;
  rewardsEarned: number;
  lastClaimAt: number;
} | null {
  try {
    const data = accountInfo.data;
    // Anchor layout: 8(discriminator) + 32(user) + 8(staked_amount u64) + 8(last_claim_at i64) + 1(bump)
    if (data.length < 8 + 32 + 8 + 8 + 1) return null;

    const stakedAmountRaw = data.readBigUInt64LE(8 + 32);
    const lastClaimAt = Number(data.readBigInt64LE(8 + 32 + 8));

    return {
      stakedAmount: Number(stakedAmountRaw) / (10 ** SKR_DECIMALS),
      rewardsEarned: 0,
      lastClaimAt,
    };
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Watch on-chain account changes for the current wallet in real-time.
 *
 * Subscribes to:
 * - **SOL account** (native balance)  → updates `solanaKeys.sol` cache
 * - **SKR ATA** (token balance)       → updates `solanaKeys.skr` cache
 * - **Staker PDA** (staking info)     → updates `['staker', 'info']` cache
 *
 * All updates are **instant** — no polling, no refetch, just direct cache set.
 *
 * @param publicKeyBase58 - Current wallet public key (null = disconnected)
 *
 * @example
 * function App() {
 *   const { publicKeyBase58 } = useWallet();
 *   useAccountWatcher(publicKeyBase58);
 * }
 */
export function useAccountWatcher(publicKeyBase58: string | null) {
  const queryClient = useQueryClient();
  const subsRef = useRef<SubscriptionEntry[]>([]);
  const connectionRef = useRef<Connection | null>(null);

  // ── Cleanup helper ─────────────────────────────────────────────────────
  const cleanupSubscriptions = useCallback(() => {
    const conn = connectionRef.current;
    if (!conn) return;

    for (const sub of subsRef.current) {
      try {
        conn.removeAccountChangeListener(sub.id);
        console.log(`[AccountWatcher] Unsubscribed: ${sub.label} (id: ${sub.id})`);
      } catch (err) {
        console.warn(`[AccountWatcher] Failed to unsubscribe ${sub.label}:`, err);
      }
    }
    subsRef.current = [];
  }, []);

  useEffect(() => {
    if (!publicKeyBase58) {
      cleanupSubscriptions();
      return;
    }

    // Clean previous subscriptions before setting up new ones
    cleanupSubscriptions();

    const connection = getWsConnection();
    connectionRef.current = connection;

    const userPk = new PublicKey(publicKeyBase58);
    const subs: SubscriptionEntry[] = [];

    // ── 1. Watch Native SOL Balance ────────────────────────────────────────
    try {
      const solSubId = connection.onAccountChange(
        userPk,
        (accountInfo) => {
          const sol = parseSOLBalance(accountInfo);
          console.log(`[AccountWatcher] SOL balance changed: ${sol.toFixed(4)} SOL`);

          // Direct cache set — instant UI update, no refetch needed
          queryClient.setQueryData(solanaKeys.sol(publicKeyBase58), sol);
        },
        'confirmed',
      );
      subs.push({ id: solSubId, label: 'SOL' });
      console.log(`[AccountWatcher] Subscribed to SOL balance (id: ${solSubId})`);
    } catch (err) {
      console.warn('[AccountWatcher] Failed to subscribe SOL:', err);
    }

    // ── 2. Watch SKR Token Balance ─────────────────────────────────────────
    if (SKR_MINT_ADDRESS) {
      (async () => {
        try {
          const skrMint = new PublicKey(SKR_MINT_ADDRESS);
          const ata = await getAssociatedTokenAddress(skrMint, userPk);

          const skrSubId = connection.onAccountChange(
            ata,
            (accountInfo) => {
              const skrData = parseSKRBalance(accountInfo);
              console.log(`[AccountWatcher] SKR balance changed: ${skrData.balance} SKR`);

              queryClient.setQueryData(solanaKeys.skr(publicKeyBase58), skrData);
            },
            'confirmed',
          );
          subs.push({ id: skrSubId, label: 'SKR' });
          console.log(`[AccountWatcher] Subscribed to SKR balance (id: ${skrSubId})`);
        } catch (err) {
          console.warn('[AccountWatcher] Failed to subscribe SKR:', err);
        }
      })();
    }

    // ── 3. Watch Staker PDA Account ────────────────────────────────────────
    try {
      const { stakerPda } = deriveStakingPDAs(userPk);

      const stakerSubId = connection.onAccountChange(
        stakerPda,
        (accountInfo) => {
          const stakerInfo = parseStakerAccount(accountInfo);
          console.log(`[AccountWatcher] Staker account changed:`, stakerInfo);

          queryClient.setQueryData(
            ['staker', 'info', publicKeyBase58],
            stakerInfo,
          );
        },
        'confirmed',
      );
      subs.push({ id: stakerSubId, label: 'Staker PDA' });
      console.log(`[AccountWatcher] Subscribed to Staker PDA (id: ${stakerSubId})`);
    } catch (err) {
      console.warn('[AccountWatcher] Failed to subscribe Staker PDA:', err);
    }

    subsRef.current = subs;

    // ── Cleanup on unmount / wallet change ────────────────────────────────
    return () => {
      cleanupSubscriptions();
    };
  }, [publicKeyBase58, queryClient, cleanupSubscriptions]);
}
