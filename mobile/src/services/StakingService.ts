// ─────────────────────────────────────────────────────────────────────────────
// StakingService — Anchor IDL Transaction Builder (Devnet)
//
// Production-grade staking service that:
//   1. Constructs instructions from real Anchor IDL discriminators
//   2. Prepends Compute Budget instructions for priority fees
//   3. Simulates transaction before sending (saves user gas on failure)
//   4. Supports both Legacy and Versioned transactions
//   5. Works with MWA signAndSendTransaction flow
//
// All PDAs derived from on-chain IDL seed definitions.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  SendTransactionError,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { DISCRIMINATORS } from '../shared/idl/ecoquestIdl';
import { ECOQUEST_PROGRAM_ID, SKR_DECIMALS } from '../shared/config/constants';
import { getConnection } from '../shared/lib/rpcConnection';

// ── Constants ────────────────────────────────────────────────────────────────

/** Compute unit limit — generous but bounded */
const COMPUTE_UNIT_LIMIT = 200_000;

// ── PDA Derivation ───────────────────────────────────────────────────────────

/**
 * Derives all staking-related PDAs from the program.
 * Seeds match the Anchor IDL exactly.
 */
export function deriveStakingPDAs(
  userPublicKey: PublicKey,
  programId: PublicKey = ECOQUEST_PROGRAM_ID,
) {
  const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('stake_pool')],
    programId,
  );

  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('stake_vault'), poolPda.toBuffer()],
    programId,
  );

  const [stakerPda, stakerBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('staker'), userPublicKey.toBuffer()],
    programId,
  );

  return {
    poolPda,
    poolBump,
    vaultPda,
    vaultBump,
    stakerPda,
    stakerBump,
  };
}

// ── Error Types ──────────────────────────────────────────────────────────────

export class StakingTransactionError extends Error {
  constructor(
    message: string,
    public readonly phase: 'build' | 'simulate' | 'sign' | 'send' | 'confirm',
    public readonly logs?: string[],
  ) {
    super(message);
    this.name = 'StakingTransactionError';
  }
}

// ── Instruction Builders ─────────────────────────────────────────────────────

/**
 * Build a `stake_skr` instruction using real IDL discriminator.
 *
 * Accounts (from IDL):
 *   0. user          [signer, writable]
 *   1. pool          [writable]           — PDA ["stake_pool"]
 *   2. user_token_account [writable]      — user's SKR ATA
 *   3. vault         [writable]           — PDA ["stake_vault", pool]
 *   4. staker        [writable]           — PDA ["staker", user]
 *   5. token_program                      — SPL Token program
 *
 * Args: amount (u64 LE)
 */
/**
 * Write a u64 as 8-byte little-endian into `buf` at `offset`.
 *
 * WHY: `Buffer.writeBigUInt64LE` is NOT available in the React Native / Hermes
 * `buffer` polyfill (v5.x). We replicate it manually using bitwise ops on the
 * low 32 bits and integer division for the high 32 bits.
 */
function writeUInt64LE(buf: Buffer, value: bigint, offset: number): void {
  const lo = Number(value & BigInt(0xffffffff));
  const hi = Number(value >> BigInt(32));
  buf.writeUInt32LE(lo, offset);
  buf.writeUInt32LE(hi, offset + 4);
}

function buildStakeSkrIx(
  userPublicKey: PublicKey,
  userTokenAccount: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const pdas = deriveStakingPDAs(userPublicKey);

  // Layout: discriminator(8) + amount(8 LE u64)
  const data = Buffer.alloc(16);
  DISCRIMINATORS.stakeSkr.copy(data, 0);
  writeUInt64LE(data, amount, 8); // FIX: use compat helper, not writeBigUInt64LE

  return new TransactionInstruction({
    programId: ECOQUEST_PROGRAM_ID,
    keys: [
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: pdas.poolPda, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: pdas.vaultPda, isSigner: false, isWritable: true },
      { pubkey: pdas.stakerPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build an `unstake_skr` instruction using real IDL discriminator.
 *
 * Same account layout as stake_skr.
 * Args: amount (u64 LE)
 */
function buildUnstakeSkrIx(
  userPublicKey: PublicKey,
  userTokenAccount: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const pdas = deriveStakingPDAs(userPublicKey);

  const data = Buffer.alloc(16);
  DISCRIMINATORS.unstakeSkr.copy(data, 0);
  writeUInt64LE(data, amount, 8); // FIX: use compat helper

  return new TransactionInstruction({
    programId: ECOQUEST_PROGRAM_ID,
    keys: [
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: pdas.poolPda, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: pdas.vaultPda, isSigner: false, isWritable: true },
      { pubkey: pdas.stakerPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a `claim_staking_rewards` instruction.
 *
 * Accounts (from IDL):
 *   0. user    [signer]
 *   1. pool                — PDA ["stake_pool"]
 *   2. staker  [writable]  — PDA ["staker", user]
 *
 * No args.
 */
function buildClaimRewardsIx(
  userPublicKey: PublicKey,
): TransactionInstruction {
  const pdas = deriveStakingPDAs(userPublicKey);

  return new TransactionInstruction({
    programId: ECOQUEST_PROGRAM_ID,
    keys: [
      { pubkey: userPublicKey, isSigner: true, isWritable: false },
      { pubkey: pdas.poolPda, isSigner: false, isWritable: false },
      { pubkey: pdas.stakerPda, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(DISCRIMINATORS.claimStakingRewards),
  });
}

/**
 * Build an `initialize_staker` instruction.
 *
 * Accounts (from IDL):
 *   0. user           [signer, writable]
 *   1. staker         [writable] — PDA ["staker", user]
 *   2. system_program
 *
 * No args.
 */
function buildInitializeStakerIx(
  userPublicKey: PublicKey,
): TransactionInstruction {
  const pdas = deriveStakingPDAs(userPublicKey);

  return new TransactionInstruction({
    programId: ECOQUEST_PROGRAM_ID,
    keys: [
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: pdas.stakerPda, isSigner: false, isWritable: true },
      {
        pubkey: new PublicKey('11111111111111111111111111111111'),
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.from(DISCRIMINATORS.initializeStaker),
  });
}

// ── Compute Budget Helpers ───────────────────────────────────────────────────

import { buildDynamicComputeBudget } from './priorityFeeService';
import { withATACreation } from './SKRManager';

/**
 * Creates Compute Budget instructions with dynamic priority fees.
 * Queries live network data for optimal pricing.
 * Falls back to static values if dynamic fetch fails.
 */
async function createComputeBudgetIxsDynamic(): Promise<TransactionInstruction[]> {
  try {
    const { instructions } = await buildDynamicComputeBudget('medium', COMPUTE_UNIT_LIMIT);
    return instructions;
  } catch {
    // Fallback to safe static values
    return [
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    ];
  }
}

// ── Simulation ───────────────────────────────────────────────────────────────

/**
 * Simulate a transaction before sending.
 * Throws StakingTransactionError with parsed logs if simulation fails.
 *
 * This prevents users from paying gas for transactions that would fail on-chain.
 */
async function simulateTransaction(
  connection: Connection,
  transaction: Transaction,
  feePayer: PublicKey,
): Promise<void> {
  try {
    // FIX: Convert to VersionedTransaction (v0) so we can pass SimulateTransactionConfig
    // with `sigVerify: false`. The legacy `Transaction` overload does NOT support that
    // config object — it only accepts Signer[]. Without sigVerify:false the RPC rejects
    // the unsigned tx before even running the program, hiding the real error.
    const message = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: transaction.recentBlockhash!,
      instructions: transaction.instructions,
    }).compileToV0Message();
    const versionedTx = new VersionedTransaction(message);

    const result = await connection.simulateTransaction(versionedTx, {
      sigVerify: false,
      accounts: {
        encoding: 'base64',
        addresses: [],
      },
    });

    if (result.value.err) {
      // Extract program error logs
      const logs = result.value.logs ?? [];
      const anchorError = logs.find(
        (l) => l.includes('Error Code:') || l.includes('AnchorError'),
      );
      // Also include raw error in case Anchor didn't emit a log (e.g. InvalidInstructionData)
      const rawErr = JSON.stringify(result.value.err);
      const errorMsg = anchorError
        ? anchorError.replace(/^Program log: /, '')
        : `Simulation failed: ${rawErr}`;

      console.error('[Staking] Simulation failed:', errorMsg);
      console.error('[Staking] Raw error:', rawErr);
      console.error('[Staking] Logs:\n', logs.join('\n'));

      throw new StakingTransactionError(errorMsg, 'simulate', logs);
    }

    console.log('[Staking] Simulation passed ✓');
  } catch (err) {
    if (err instanceof StakingTransactionError) throw err;
    throw new StakingTransactionError(
      `Simulation error: ${err instanceof Error ? err.message : 'Unknown'}`,
      'simulate',
    );
  }
}

// ── Transaction Builder ──────────────────────────────────────────────────────

export type SignTransactionFn = (tx: Transaction) => Promise<Transaction>;

export interface StakeParams {
  userPublicKey: PublicKey;
  userTokenAccount: PublicKey;
  /** Amount in human-readable units (e.g. 100 for 100 SKR) */
  amount: number;
  /** MWA sign function from useMobileWallet() */
  signTransaction: SignTransactionFn;
  /** Skip simulation? Default: false */
  skipSimulation?: boolean;
}

export interface ClaimParams {
  userPublicKey: PublicKey;
  signTransaction: SignTransactionFn;
  skipSimulation?: boolean;
}

export interface InitStakerParams {
  userPublicKey: PublicKey;
  signTransaction: SignTransactionFn;
}

/**
 * AnchorStakingService — Production-grade transaction builder for devnet.
 *
 * @example
 * const service = new AnchorStakingService();
 * const sig = await service.stakeSkr({
 *   userPublicKey: new PublicKey('...'),
 *   userTokenAccount: new PublicKey('...'),
 *   amount: 100,
 *   signTransaction: mwaSignFn,
 * });
 */
export class AnchorStakingService {
  /**
   * Build, simulate, sign, and send a staking transaction.
   *
   * Flow: ATA check → Build → DynamicComputeBudget → Simulate → Sign(MWA) → Send → Confirm
   */
  async stakeSkr(params: StakeParams): Promise<string> {
    const { userPublicKey, userTokenAccount, amount, signTransaction, skipSimulation } = params;

    // Convert human units → base units (6 decimals)
    const baseAmount = BigInt(Math.floor(amount * 10 ** SKR_DECIMALS));

    const ix = buildStakeSkrIx(userPublicKey, userTokenAccount, baseAmount);

    // Atomic: prepend ATA creation if user doesn't have one yet
    const instructions = await withATACreation(userPublicKey, [ix]);

    return this._buildAndSend({
      instructions,
      feePayer: userPublicKey,
      signTransaction,
      skipSimulation,
      label: `Stake ${amount} SKR`,
    });
  }

  /**
   * Build, simulate, sign, and send an unstaking transaction.
   */
  async unstakeSkr(params: StakeParams): Promise<string> {
    const { userPublicKey, userTokenAccount, amount, signTransaction, skipSimulation } = params;

    const baseAmount = BigInt(Math.floor(amount * 10 ** SKR_DECIMALS));

    const ix = buildUnstakeSkrIx(userPublicKey, userTokenAccount, baseAmount);

    // Atomic: prepend ATA creation if user doesn't have one yet
    const instructions = await withATACreation(userPublicKey, [ix]);

    return this._buildAndSend({
      instructions,
      feePayer: userPublicKey,
      signTransaction,
      skipSimulation,
      label: `Unstake ${amount} SKR`,
    });
  }

  /**
   * Claim accumulated staking rewards.
   */
  async claimRewards(params: ClaimParams): Promise<string> {
    const { userPublicKey, signTransaction, skipSimulation } = params;

    const ix = buildClaimRewardsIx(userPublicKey);
    const instructions: TransactionInstruction[] = [];

    // Check if staker account exists — if not, prepend initialization
    const hasStaker = await this.hasStakerAccount(userPublicKey);
    if (!hasStaker) {
      instructions.push(buildInitializeStakerIx(userPublicKey));
    }
    instructions.push(ix);

    return this._buildAndSend({
      instructions,
      feePayer: userPublicKey,
      signTransaction,
      skipSimulation,
      label: 'Claim Staking Rewards',
    });
  }

  /**
   * Initialize staker account (one-time, before first stake).
   * Creates PDA ["staker", user] on-chain.
   */
  async initializeStaker(params: InitStakerParams): Promise<string> {
    const { userPublicKey, signTransaction } = params;

    const ix = buildInitializeStakerIx(userPublicKey);

    return this._buildAndSend({
      instructions: [ix],
      feePayer: userPublicKey,
      signTransaction,
      skipSimulation: false,
      label: 'Initialize Staker Account',
    });
  }

  /**
   * Check if user has an initialized staker account.
   */
  async hasStakerAccount(userPublicKey: PublicKey): Promise<boolean> {
    const connection = await getConnection();
    const pdas = deriveStakingPDAs(userPublicKey);

    const info = await connection.getAccountInfo(pdas.stakerPda);
    return info !== null;
  }

  /**
   * Fetch on-chain staker account data.
   * Returns null if staker account doesn't exist.
   */
  async getStakerInfo(
    userPublicKey: PublicKey,
  ): Promise<{ stakedAmount: number; rewardsEarned: number; lastClaimAt: number } | null> {
    const connection = await getConnection();
    const pdas = deriveStakingPDAs(userPublicKey);

    const info = await connection.getAccountInfo(pdas.stakerPda);
    if (!info || !info.data) return null;

    // Anchor account layout: 8 (discriminator) + fields
    // Staker fields (from IDL): user(32) + staked_amount(8) + last_claim_at(8) + bump(1)
    const data = info.data;
    if (data.length < 8 + 32 + 8 + 8 + 1) return null;

    const stakedAmountRaw = data.readBigUInt64LE(8 + 32);
    const lastClaimAt = Number(data.readBigInt64LE(8 + 32 + 8));

    return {
      stakedAmount: Number(stakedAmountRaw) / 10 ** SKR_DECIMALS,
      rewardsEarned: 0, // Rewards are calculated on-chain during claim
      lastClaimAt,
    };
  }

  // ── Internal: Build → Simulate → Sign → Send → Confirm ──────────────────

  private async _buildAndSend(options: {
    instructions: TransactionInstruction[];
    feePayer: PublicKey;
    signTransaction: SignTransactionFn;
    skipSimulation?: boolean;
    label: string;
  }): Promise<string> {
    const { instructions, feePayer, signTransaction, skipSimulation = false, label } = options;

    const connection = await getConnection();

    // ── 1. Build transaction ──────────────────────────────────────────────
    console.log(`[Staking] Building: ${label}`);

    const computeIxs = await createComputeBudgetIxsDynamic();
    const transaction = new Transaction();

    // Compute Budget FIRST, then program instructions
    computeIxs.forEach((ix) => transaction.add(ix));
    instructions.forEach((ix) => transaction.add(ix));

    // Set blockhash + fee payer
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = feePayer;

    // ── 2. Simulate ───────────────────────────────────────────────────────
    if (!skipSimulation) {
      await simulateTransaction(connection, transaction, feePayer);
    }

    // ── 3. Sign via MWA ───────────────────────────────────────────────────
    console.log(`[Staking] Requesting MWA signature: ${label}`);
    let signedTx: Transaction;
    try {
      signedTx = await signTransaction(transaction);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'User rejected transaction';
      throw new StakingTransactionError(msg, 'sign');
    }

    // ── 4. Send ───────────────────────────────────────────────────────────
    console.log(`[Staking] Sending: ${label}`);
    let signature: string;
    try {
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true, // Already simulated
        maxRetries: 3,
        preflightCommitment: 'processed',
      });
      console.log(`[Staking] Sent: ${signature}`);
    } catch (err) {
      const logs = err instanceof SendTransactionError ? err.logs : undefined;
      const msg = err instanceof Error ? err.message : 'Send failed';
      throw new StakingTransactionError(msg, 'send', logs ?? undefined);
    }

    // ── 5. Confirm ────────────────────────────────────────────────────────
    console.log(`[Staking] Confirming: ${label}`);
    try {
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      if (confirmation.value.err) {
        throw new StakingTransactionError(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
          'confirm',
        );
      }
    } catch (err) {
      if (err instanceof StakingTransactionError) throw err;
      throw new StakingTransactionError(
        `Confirmation failed: ${err instanceof Error ? err.message : 'Unknown'}`,
        'confirm',
      );
    }

    console.log(`[Staking] ✅ ${label} confirmed: ${signature}`);
    return signature;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
export const stakingService = new AnchorStakingService();
