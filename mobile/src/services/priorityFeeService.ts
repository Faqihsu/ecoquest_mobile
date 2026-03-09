/**
 * services/priorityFeeService.ts — Dynamic Priority Fees for Mainnet
 *
 * Queries recent prioritization fees from Solana RPC to determine
 * optimal compute unit pricing based on current network congestion.
 *
 * Uses percentile-based recommendations:
 *   - Low:    25th percentile (slower but cheaper)
 *   - Medium: 50th percentile (balanced)
 *   - High:   75th percentile (fast, higher fee)
 *   - Turbo:  90th percentile (next-block guarantee)
 */

import { ComputeBudgetProgram, TransactionInstruction } from '@solana/web3.js';
import { getConnection } from '../shared/lib/rpcConnection';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FeeUrgency = 'low' | 'medium' | 'high' | 'turbo';

export interface PriorityFeeEstimate {
  /** Micro-lamports per compute unit */
  microLamports: number;
  /** Human-friendly label */
  label: string;
  /** Estimated priority fee in SOL for 200k CU */
  estimatedFeeSol: number;
}

// ── Fallback fees if RPC doesn't support getRecentPrioritizationFees ──────────

const FALLBACK_FEES: Record<FeeUrgency, number> = {
  low:    1_000,
  medium: 50_000,
  high:   200_000,
  turbo:  1_000_000,
};

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Fetch recent priority fees from Solana RPC.
 * Returns sorted array of per-CU fees (micro-lamports).
 */
export async function fetchRecentPriorityFees(): Promise<number[]> {
  const connection = await getConnection();

  try {
    const result = await connection.getRecentPrioritizationFees();

    // Extract non-zero fees and sort
    const fees = result
      .map((entry) => entry.prioritizationFee)
      .filter((fee) => fee > 0)
      .sort((a, b) => a - b);

    if (fees.length === 0) {
      return [FALLBACK_FEES.medium]; // Network has no congestion
    }

    return fees;
  } catch (err) {
    console.warn('[PriorityFee] Failed to fetch, using fallback:', err);
    return Object.values(FALLBACK_FEES).sort((a, b) => a - b);
  }
}

/**
 * Get the percentile value from a sorted array.
 */
function percentile(sorted: number[], pct: number): number {
  const idx = Math.min(
    Math.floor(sorted.length * (pct / 100)),
    sorted.length - 1,
  );
  return sorted[idx];
}

/**
 * Get recommended priority fee based on urgency level.
 *
 * Queries live network data and returns the appropriate percentile.
 */
export async function getRecommendedFee(
  urgency: FeeUrgency = 'medium',
): Promise<PriorityFeeEstimate> {
  const fees = await fetchRecentPriorityFees();

  const pctMap: Record<FeeUrgency, number> = {
    low:    25,
    medium: 50,
    high:   75,
    turbo:  90,
  };

  const labelMap: Record<FeeUrgency, string> = {
    low:    '🐢 Low Priority',
    medium: '⚡ Standard',
    high:   '🚀 High Priority',
    turbo:  '💎 Turbo (Next Block)',
  };

  const microLamports = Math.max(
    percentile(fees, pctMap[urgency]),
    FALLBACK_FEES.low, // Minimum floor
  );

  // Estimated fee in SOL for 200,000 CU
  // Formula: (microLamports * CU) / 1_000_000 / LAMPORTS_PER_SOL
  const estimatedFeeSol = (microLamports * 200_000) / 1_000_000 / 1_000_000_000;

  return {
    microLamports,
    label: labelMap[urgency],
    estimatedFeeSol,
  };
}

/**
 * Build Compute Budget instructions with dynamic priority fee.
 *
 * Replaces the static `COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 50_000`
 * in StakingService with live network data.
 *
 * @param urgency  Fee urgency level
 * @param cuLimit  Compute unit limit (default: 200,000)
 */
export async function buildDynamicComputeBudget(
  urgency: FeeUrgency = 'medium',
  cuLimit = 200_000,
): Promise<{ instructions: TransactionInstruction[]; fee: PriorityFeeEstimate }> {
  const fee = await getRecommendedFee(urgency);

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: fee.microLamports }),
  ];

  return { instructions, fee };
}
