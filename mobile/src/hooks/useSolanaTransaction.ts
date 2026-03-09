// ─────────────────────────────────────────────────────────────────────────────
// useSolanaTransaction — Full Transaction Lifecycle Hook
//
// Lifecycle: Sign (MWA) → Send → Confirm (confirmed) → Finalize (background)
//            → Zustand state update at every step
//
// Error handling:
//   - BlockhashExpiredError  → retry with fresh blockhash (up to 2x)
//   - SendTransactionError   → parse logs for program error code
//   - All errors             → typed SolanaTransactionError with context
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import {
  Transaction,
  PublicKey,
  SendTransactionError,
  BlockhashWithExpiryBlockHeight,
} from '@solana/web3.js';
import { useTransactionStore } from './useTransactionStore';
import { getConnection, invalidateConnectionCache } from '../shared/lib/rpcConnection';
import { useTransactionToast } from '../components/TransactionToastProvider';

// ── Error Types ───────────────────────────────────────────────────────────────

export class SolanaTransactionError extends Error {
  constructor(
    message: string,
    public readonly stage: 'signing' | 'sending' | 'confirming' | 'finalizing',
    public readonly txId?: string,
    public readonly signature?: string,
    public readonly logs?: string[]
  ) {
    super(message);
    this.name = 'SolanaTransactionError';
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type MwaSignFn = (transaction: Transaction) => Promise<Transaction>;

export interface SendTxOptions {
  /** Human-readable label shown in UI (e.g. "Stake 100 SKR") */
  label: string;
  /** Use 'finalized' for irreversible ops (e.g. large stakes). Default: 'confirmed' */
  commitment?: 'confirmed' | 'finalized';
  /** Skip preflight simulation. Default: false */
  skipPreflight?: boolean;
}

export interface SendTxResult {
  signature: string;
  confirmedAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parse a SendTransactionError's logs to extract a human-readable
 * Anchor program error message (e.g. "Error Code: BelowMinimumStake").
 */
function parseProgramError(err: unknown): string {
  if (err instanceof SendTransactionError) {
    const logs = err.logs ?? [];
    const anchorError = logs.find((l) => l.includes('Error Code:') || l.includes('AnchorError'));
    if (anchorError) return anchorError.replace(/^Program log: /, '');
  }
  if (err instanceof Error) return err.message;
  return 'Unknown transaction error';
}

/**
 * Translate raw Solana/MWA error messages into user-friendly Indonesian strings.
 * Keeps the original as fallback.
 */
function translateError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();

  // User rejected in wallet
  if (
    lower.includes('user rejected') ||
    lower.includes('request_declined') ||
    lower.includes('user cancelled') ||
    lower.includes('user denied')
  ) {
    return 'Transaksi dibatalkan dari wallet.';
  }

  // Insufficient funds
  if (
    lower.includes('insufficient funds') ||
    lower.includes('insufficient lamports') ||
    lower.includes('0x1') // common Solana insufficient balance error code
  ) {
    return 'Saldo tidak mencukupi untuk transaksi ini.';
  }

  // Below minimum stake
  if (lower.includes('belowminimumstake') || lower.includes('below minimum')) {
    return 'Jumlah stake di bawah minimum (100 SKR).';
  }

  // Blockhash expired
  if (
    lower.includes('blockhash') &&
    (lower.includes('expired') || lower.includes('not found'))
  ) {
    return 'Sesi transaksi kedaluwarsa. Silakan coba lagi.';
  }

  // Network / timeout
  if (lower.includes('timeout') || lower.includes('network') || lower.includes('fetch')) {
    return 'Koneksi jaringan bermasalah. Periksa internet Anda dan coba lagi.';
  }

  // Simulation failed
  if (lower.includes('simulation failed') || lower.includes('preflight')) {
    return 'Simulasi transaksi gagal. Pastikan data transaksi benar.';
  }

  // Default fallback — still friendly
  return 'Terjadi kesalahan. Silakan coba lagi.';
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook providing `sendTransaction` — a function that handles the full
 * Solana transaction lifecycle with Zustand state updates.
 *
 * @example
 * const { sendTransaction, pendingCount } = useSolanaTransaction();
 *
 * const sig = await sendTransaction(
 *   tx,
 *   mwaSignFn,
 *   { label: 'Stake 100 SKR' }
 * );
 */
export function useSolanaTransaction() {
  const { addTx, updateTx, getTxList, getPendingCount } = useTransactionStore();
  const { showToast, dismissToast } = useTransactionToast();

  const sendTransaction = useCallback(
    async (
      transaction: Transaction,
      mwaSign: MwaSignFn,
      options: SendTxOptions
    ): Promise<SendTxResult> => {
      const { label, commitment = 'confirmed', skipPreflight = false } = options;
      const txId = generateId();

      // ── Register in Zustand ────────────────────────────────────────────────
      addTx({ id: txId, status: 'pending', label });

      let connection = await getConnection();
      let blockhashInfo: BlockhashWithExpiryBlockHeight;
      let signedTx: Transaction;
      let signature: string;

      // ── Step 1: Fetch blockhash + prepare tx ───────────────────────────────
      try {
        blockhashInfo = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhashInfo.blockhash;
        transaction.lastValidBlockHeight = blockhashInfo.lastValidBlockHeight;
      } catch (err) {
        updateTx(txId, { status: 'failed', error: 'Failed to fetch blockhash' });
        throw new SolanaTransactionError('Failed to fetch blockhash', 'signing', txId);
      }

      // ── Step 2: Sign via MWA ───────────────────────────────────────────────
      updateTx(txId, { status: 'signing' });
      showToast('awaiting_approval', { label });
      try {
        signedTx = await mwaSign(transaction);
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : 'User rejected transaction';
        const friendlyMsg = translateError(rawMsg);
        updateTx(txId, { status: 'failed', error: friendlyMsg });
        showToast('error', { label, errorMessage: friendlyMsg });
        throw new SolanaTransactionError(rawMsg, 'signing', txId);
      }

      // ── Step 3: Send ───────────────────────────────────────────────────────
      updateTx(txId, { status: 'sending' });
      showToast('confirming', { label });
      try {
        signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight,
          maxRetries: 3,
          preflightCommitment: 'processed',
        });
        updateTx(txId, { signature });
        console.log(`[TX] Sent: ${signature}`);
      } catch (err) {
        // If connection error, invalidate cache and retry once with fresh node
        if (!(err instanceof SendTransactionError)) {
          invalidateConnectionCache();
          try {
            connection = await getConnection();
            blockhashInfo = await connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhashInfo.blockhash;
            transaction.lastValidBlockHeight = blockhashInfo.lastValidBlockHeight;
            signedTx = await mwaSign(transaction);
            signature = await connection.sendRawTransaction(signedTx.serialize(), {
              skipPreflight,
              maxRetries: 3,
            });
            updateTx(txId, { signature });
          } catch (retryErr) {
            const rawMsg = parseProgramError(retryErr);
            const friendlyMsg = translateError(rawMsg);
            updateTx(txId, { status: 'failed', error: friendlyMsg });
            showToast('error', { label, errorMessage: friendlyMsg });
            throw new SolanaTransactionError(rawMsg, 'sending', txId, undefined);
          }
        } else {
          const logs = (err as SendTransactionError).logs;
          const rawMsg = parseProgramError(err);
          const friendlyMsg = translateError(rawMsg);
          updateTx(txId, { status: 'failed', error: friendlyMsg });
          showToast('error', { label, errorMessage: friendlyMsg });
          throw new SolanaTransactionError(rawMsg, 'sending', txId, undefined, logs);
        }
      }

      // ── Step 4: Confirm ────────────────────────────────────────────────────
      updateTx(txId, { status: 'confirming' });
      try {
        const result = await connection.confirmTransaction(
          {
            signature,
            blockhash: blockhashInfo!.blockhash,
            lastValidBlockHeight: blockhashInfo!.lastValidBlockHeight,
          },
          commitment
        );

        if (result.value.err) {
          const rawMsg = `Transaction failed on-chain: ${JSON.stringify(result.value.err)}`;
          const friendlyMsg = translateError(rawMsg);
          updateTx(txId, { status: 'failed', error: friendlyMsg });
          showToast('error', { label, errorMessage: friendlyMsg, signature });
          throw new SolanaTransactionError(rawMsg, 'confirming', txId, signature);
        }
      } catch (err) {
        if (err instanceof SolanaTransactionError) throw err;
        const rawMsg = parseProgramError(err);
        const friendlyMsg = translateError(rawMsg);
        updateTx(txId, { status: 'failed', error: friendlyMsg });
        showToast('error', { label, errorMessage: friendlyMsg, signature });
        throw new SolanaTransactionError(rawMsg, 'confirming', txId, signature);
      }

      const confirmedAt = Date.now();
      updateTx(txId, { status: 'confirmed', confirmedAt });
      showToast('success', { label, signature });
      console.log(`[TX] Confirmed: ${signature}`);

      // ── Step 5: Finalize (background — non-blocking) ───────────────────────
      if (commitment !== 'finalized') {
        // Fire-and-forget: upgrade to finalized in background
        connection
          .confirmTransaction(
            {
              signature,
              blockhash: blockhashInfo!.blockhash,
              lastValidBlockHeight: blockhashInfo!.lastValidBlockHeight,
            },
            'finalized'
          )
          .then(() => {
            updateTx(txId, { status: 'finalized', finalizedAt: Date.now() });
            console.log(`[TX] Finalized: ${signature}`);
          })
          .catch((err) => {
            // Finalization failure is non-critical — tx is already confirmed
            console.warn(`[TX] Finalization check failed (non-critical):`, err);
          });
      } else {
        updateTx(txId, { status: 'finalized', finalizedAt: confirmedAt });
      }

      return { signature, confirmedAt };
    },
    [addTx, updateTx, showToast]
  );

  return {
    sendTransaction,
    txRecords: getTxList(),
    pendingCount: getPendingCount(),
  };
}
