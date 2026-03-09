// ─────────────────────────────────────────────────────────────────────────────
// Zustand Transaction Store
//
// Single source of truth for all Solana transaction state.
// Consumed by useSolanaTransaction, useQuestActions, useStaking, and UI.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TxStatus =
  | 'pending'      // Created locally, not yet signed
  | 'signing'      // Waiting for MWA wallet signature
  | 'sending'      // Submitted to RPC, awaiting inclusion
  | 'confirming'   // Included in block, awaiting confirmation
  | 'confirmed'    // Confirmed (1 validator confirmation)
  | 'finalized'    // Finalized (max lockout — irreversible)
  | 'failed';      // Error at any stage

export interface TxRecord {
  /** Local UUID — stable before signature is known */
  id: string;
  /** Solana transaction signature — available after send */
  signature?: string;
  /** Current lifecycle status */
  status: TxStatus;
  /** Human-readable label for UI (e.g. "Klaim NFT Quest #3") */
  label: string;
  /** Error message if status === 'failed' */
  error?: string;
  /** Unix ms when tx was created */
  createdAt: number;
  /** Unix ms when tx reached 'confirmed' */
  confirmedAt?: number;
  /** Unix ms when tx reached 'finalized' */
  finalizedAt?: number;
}

interface TransactionStore {
  /** All tracked transactions, keyed by local ID */
  txs: Record<string, TxRecord>;

  /** Add a new transaction record */
  addTx: (tx: Omit<TxRecord, 'createdAt'>) => void;

  /** Update fields on an existing transaction */
  updateTx: (id: string, patch: Partial<TxRecord>) => void;

  /** Remove all completed (confirmed/finalized/failed) transactions */
  clearCompleted: () => void;

  // ── Derived selectors ─────────────────────────────────────────────────────

  /** All tx records as an array, newest first */
  getTxList: () => TxRecord[];

  /** Count of in-flight transactions (not yet confirmed/failed) */
  getPendingCount: () => number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  txs: {},

  addTx: (tx) =>
    set((state) => ({
      txs: {
        ...state.txs,
        [tx.id]: { ...tx, createdAt: Date.now() },
      },
    })),

  updateTx: (id, patch) =>
    set((state) => {
      const existing = state.txs[id];
      if (!existing) return state;
      return {
        txs: {
          ...state.txs,
          [id]: { ...existing, ...patch },
        },
      };
    }),

  clearCompleted: () =>
    set((state) => {
      const active: Record<string, TxRecord> = {};
      for (const [id, tx] of Object.entries(state.txs)) {
        if (tx.status !== 'confirmed' && tx.status !== 'finalized' && tx.status !== 'failed') {
          active[id] = tx;
        }
      }
      return { txs: active };
    }),

  getTxList: () =>
    Object.values(get().txs).sort((a, b) => b.createdAt - a.createdAt),

  getPendingCount: () => {
    const inFlight: TxStatus[] = ['pending', 'signing', 'sending', 'confirming'];
    return Object.values(get().txs).filter((tx) => inFlight.includes(tx.status)).length;
  },
}));
