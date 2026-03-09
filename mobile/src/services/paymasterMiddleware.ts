/**
 * services/paymasterMiddleware.ts — Newbie Detection + Gasless Routing
 *
 * Middleware that checks if a user qualifies for gasless (fee-sponsored)
 * transactions. Newbie users get free transactions to improve onboarding.
 *
 * Newbie criteria:
 *   ✓ Fewer than 5 completed quests
 *   ✓ SOL balance < 0.01 (can't pay gas)
 *   ✓ Account age < 7 days (based on first quest timestamp)
 *
 * Usage:
 *   const { isNewbie, freeClaimsRemaining, shouldUseGasless } = usePaymasterStatus();
 *   if (shouldUseGasless) → route to gasless relayer
 *   else → normal user-pays-gas flow
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection } from '../shared/lib/rpcConnection';
import type { UserQuest } from '../contexts/QuestContext';

// ── Config ────────────────────────────────────────────────────────────────────

/** Max quests before user "graduates" from newbie */
const NEWBIE_QUEST_THRESHOLD = 5;

/** Max free gasless claims per newbie */
const MAX_FREE_CLAIMS = 10;

/** Minimum SOL balance to be considered "can pay gas" */
const MIN_SOL_FOR_GAS = 0.01;

/** Account age threshold for newbie (7 days in ms) */
const NEWBIE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaymasterStatus {
  /** True if user qualifies as a newbie (free gas) */
  isNewbie: boolean;
  /** Why the user qualifies (for UI info) */
  newbieReason: string;
  /** Number of free gasless claims remaining */
  freeClaimsRemaining: number;
  /** Total free claims used */
  freeClaimsUsed: number;
  /** Whether to route through gasless relayer */
  shouldUseGasless: boolean;
  /** SOL balance too low to pay gas */
  insufficientSol: boolean;
}

// ── Counter (in-memory, reset on app restart; production would use backend) ──

let _gaslessClaimCount = 0;

export function getGaslessClaimCount(): number {
  return _gaslessClaimCount;
}

export function incrementGaslessClaimCount(): void {
  _gaslessClaimCount++;
}

export function resetGaslessClaimCount(): void {
  _gaslessClaimCount = 0;
}

// ── Core Logic ────────────────────────────────────────────────────────────────

/**
 * Evaluate whether a user qualifies for gasless transactions.
 *
 * @param walletAddress  - User's Solana wallet address (base58)
 * @param quests         - User's completed quest list
 * @returns PaymasterStatus indicating newbie status and gasless routing
 */
export async function evaluatePaymasterStatus(
  walletAddress: string | null,
  quests: UserQuest[],
): Promise<PaymasterStatus> {
  // Default: not connected → not a newbie, no gasless
  if (!walletAddress) {
    return {
      isNewbie: false,
      newbieReason: '',
      freeClaimsRemaining: 0,
      freeClaimsUsed: 0,
      shouldUseGasless: false,
      insufficientSol: false,
    };
  }

  const questCount = quests.length;
  const claimsUsed = _gaslessClaimCount;
  const claimsRemaining = Math.max(0, MAX_FREE_CLAIMS - claimsUsed);

  // ── Check 1: Quest count (< 5 → newbie) ─────────────────────────────────
  const fewQuests = questCount < NEWBIE_QUEST_THRESHOLD;

  // ── Check 2: Account age (< 7 days → newbie) ────────────────────────────
  let isYoungAccount = false;
  if (quests.length > 0) {
    const firstQuest = quests.reduce((oldest, q) =>
      q.completedAt < oldest.completedAt ? q : oldest
    );
    const accountAge = Date.now() - firstQuest.completedAt;
    isYoungAccount = accountAge < NEWBIE_AGE_MS;
  } else {
    // No quests = brand new user
    isYoungAccount = true;
  }

  // ── Check 3: SOL balance (< 0.01 SOL → can't pay gas) ──────────────────
  let insufficientSol = false;
  try {
    const connection = await getConnection();
    const { PublicKey } = await import('@solana/web3.js');
    const balance = await connection.getBalance(new PublicKey(walletAddress));
    insufficientSol = balance < MIN_SOL_FOR_GAS * LAMPORTS_PER_SOL;
  } catch {
    // Can't check balance — assume insufficient for safety
    insufficientSol = true;
  }

  // ── Determine newbie status ─────────────────────────────────────────────
  const isNewbie = (fewQuests || isYoungAccount) && claimsRemaining > 0;

  let newbieReason = '';
  if (isNewbie) {
    if (fewQuests && isYoungAccount) {
      newbieReason = 'Welcome! Your first transactions are free 🎉';
    } else if (fewQuests) {
      newbieReason = `Complete ${NEWBIE_QUEST_THRESHOLD - questCount} more quests to unlock full experience`;
    } else if (isYoungAccount) {
      newbieReason = 'New accounts enjoy free transactions for 7 days';
    }
  }

  // ── Should use gasless? ─────────────────────────────────────────────────
  // Route through gasless if: newbie with remaining claims OR insufficient SOL
  const shouldUseGasless = (isNewbie && claimsRemaining > 0) || insufficientSol;

  return {
    isNewbie,
    newbieReason,
    freeClaimsRemaining: claimsRemaining,
    freeClaimsUsed: claimsUsed,
    shouldUseGasless,
    insufficientSol,
  };
}

