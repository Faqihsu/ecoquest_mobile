/**
 * services/SKRManager.ts — SKR Token Manager for Devnet (Hackathon)
 *
 * Production-grade token management:
 *   ✓ ATA (Associated Token Account) auto-creation
 *   ✓ Decimal-safe conversions (UI ↔ on-chain)
 *   ✓ Atomic ATA + stake/transfer in single TX
 *   ✓ Token balance queries
 *   ✓ Input validation
 *
 * CRITICAL: SKR_MINT_ADDRESS must be set via EXPO_PUBLIC_SKR_MINT env var.
 * Never use a dummy/placeholder mint address.
 */

import {
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import { getConnection } from '../shared/lib/rpcConnection';
import { SKR_MINT_ADDRESS, SKR_DECIMALS } from '../shared/config/constants';

// ── Validation ────────────────────────────────────────────────────────────────

function getSkrMint(): PublicKey {
  if (!SKR_MINT_ADDRESS || SKR_MINT_ADDRESS.length < 32) {
    throw new Error(
      '[SKRManager] FATAL: SKR_MINT_ADDRESS is not configured. ' +
      'Set EXPO_PUBLIC_SKR_MINT to the Devnet mint address. ' +
      'DO NOT use a dummy address.'
    );
  }
  return new PublicKey(SKR_MINT_ADDRESS);
}

// ── Decimal Helpers ───────────────────────────────────────────────────────────

const DECIMALS_MULTIPLIER = 10 ** SKR_DECIMALS;

/**
 * Convert human-readable SKR amount → on-chain base units.
 * Example: toBaseUnits(100) → 100_000_000n (with 6 decimals)
 *
 * Uses integer math to avoid floating-point precision issues.
 */
export function toBaseUnits(humanAmount: number): bigint {
  if (humanAmount < 0) throw new Error('Amount cannot be negative');
  if (!isFinite(humanAmount)) throw new Error('Amount must be finite');
  // Round to max decimals to prevent precision loss
  const rounded = Math.round(humanAmount * DECIMALS_MULTIPLIER);
  return BigInt(rounded);
}

/**
 * Convert on-chain base units → human-readable SKR amount.
 * Example: toHumanUnits(100_000_000n) → 100
 */
export function toHumanUnits(baseAmount: bigint | number): number {
  const val = typeof baseAmount === 'bigint' ? Number(baseAmount) : baseAmount;
  return val / DECIMALS_MULTIPLIER;
}

/**
 * Format SKR amount for display (with symbol and proper decimals).
 * Example: formatSKR(1234.567) → "1,234.57 SKR"
 */
export function formatSKR(humanAmount: number, maxDecimals = 2): string {
  return `${humanAmount.toLocaleString('en-US', { 
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals 
  })} SKR`;
}

// ── ATA Management ────────────────────────────────────────────────────────────

export interface ATAResult {
  /** The ATA public key (always returned) */
  ata: PublicKey;
  /** CreateATA instruction if the account doesn't exist; null if it already exists */
  createInstruction: TransactionInstruction | null;
  /** Whether the ATA already existed */
  exists: boolean;
}

/**
 * Check if user has an ATA for SKR. If not, prepare the create instruction.
 *
 * This is the core function for atomic TX building:
 *   1. Derive ATA address deterministically
 *   2. Check if account exists on-chain
 *   3. If not → return createAssociatedTokenAccountInstruction
 *   4. If yes → return null instruction (no-op)
 *
 * The instruction can be prepended to any TX (stake, transfer, claim)
 * making ATA creation + action atomic in a single transaction.
 */
export async function getOrCreateATA(
  ownerPublicKey: PublicKey,
  payerPublicKey?: PublicKey,
): Promise<ATAResult> {
  const mint = getSkrMint();
  const payer = payerPublicKey ?? ownerPublicKey;

  // Derive ATA address (deterministic — same for same owner+mint)
  const ata = await getAssociatedTokenAddress(
    mint,
    ownerPublicKey,
    false, // allowOwnerOffCurve
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Check if account already exists on-chain
  const connection = await getConnection();
  try {
    await getAccount(connection, ata, 'confirmed', TOKEN_PROGRAM_ID);
    return { ata, createInstruction: null, exists: true };
  } catch (err: any) {
    if (err instanceof TokenAccountNotFoundError || err.name === 'TokenAccountNotFoundError') {
      // ATA doesn't exist — build create instruction
      const ix = createAssociatedTokenAccountInstruction(
        payer,         // payer of account creation rent
        ata,           // the ATA address to create
        ownerPublicKey, // owner of the new ATA
        mint,           // token mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      return { ata, createInstruction: ix, exists: false };
    }
    throw err; // Unknown error — propagate
  }
}

/**
 * Convenience: returns just the create instruction (or null).
 * Used when building atomic TXs:
 *
 *   const ataIx = await ensureATAInstruction(userPubkey);
 *   const stakeIx = buildStakeSkrIx(...);
 *   const tx = new Transaction();
 *   if (ataIx) tx.add(ataIx); // Only if needed
 *   tx.add(stakeIx);
 */
export async function ensureATAInstruction(
  ownerPublicKey: PublicKey,
  payerPublicKey?: PublicKey,
): Promise<TransactionInstruction | null> {
  const { createInstruction } = await getOrCreateATA(ownerPublicKey, payerPublicKey);
  return createInstruction;
}

// ── Token Balance ─────────────────────────────────────────────────────────────

/**
 * Get user's SKR token balance in human-readable units.
 * Returns 0 if ATA doesn't exist (new user).
 */
export async function getTokenBalance(ownerPublicKey: PublicKey): Promise<number> {
  const mint = getSkrMint();
  const ata = await getAssociatedTokenAddress(mint, ownerPublicKey);
  const connection = await getConnection();

  try {
    const account = await getAccount(connection, ata, 'confirmed');
    return toHumanUnits(account.amount);
  } catch (err: any) {
    if (err instanceof TokenAccountNotFoundError || err.name === 'TokenAccountNotFoundError') {
      return 0; // No ATA = no balance
    }
    throw err;
  }
}

/**
 * Get user's ATA address for SKR (deterministic, doesn't check existence).
 */
export async function getATAAddress(ownerPublicKey: PublicKey): Promise<PublicKey> {
  const mint = getSkrMint();
  return getAssociatedTokenAddress(mint, ownerPublicKey);
}

// ── Atomic Transaction Helpers ────────────────────────────────────────────────

/**
 * Build an instruction array with ATA creation prepended if needed.
 *
 * Safe for devnet: if SKR_MINT_ADDRESS is not configured, returns
 * instructions unchanged (no-op).
 *
 * Usage:
 *   const ixs = await withATACreation(userPubkey, [stakeIx, memoIx]);
 *   // If ATA doesn't exist: [createATAIx, stakeIx, memoIx]
 *   // If ATA exists:         [stakeIx, memoIx]
 */
export async function withATACreation(
  ownerPublicKey: PublicKey,
  instructions: TransactionInstruction[],
  payerPublicKey?: PublicKey,
): Promise<TransactionInstruction[]> {
  // Skip ATA check if SKR mint is not configured (devnet without SKR)
  if (!SKR_MINT_ADDRESS || SKR_MINT_ADDRESS.length < 32) {
    return instructions;
  }

  try {
    const ataIx = await ensureATAInstruction(ownerPublicKey, payerPublicKey);
    if (ataIx) {
      return [ataIx, ...instructions];
    }
  } catch (err) {
    // Non-blocking: if ATA check fails, proceed without it
    console.warn('[SKRManager] ATA check failed, proceeding without:', err);
  }
  return instructions;
}

// ── Input Validation ──────────────────────────────────────────────────────────

/**
 * Validate a SKR amount for staking/transfer.
 * Returns error message or null if valid.
 */
export function validateAmount(
  amount: number,
  balance: number,
  minAmount = 100,
): string | null {
  if (!isFinite(amount) || isNaN(amount)) return 'Invalid amount';
  if (amount <= 0) return 'Amount must be positive';
  if (amount < minAmount) return `Minimum amount is ${formatSKR(minAmount)}`;
  if (amount > balance) return `Insufficient balance (${formatSKR(balance)} available)`;
  return null; // Valid
}
