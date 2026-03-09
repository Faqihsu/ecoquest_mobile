/**
 * services/gaslessRelayer.ts
 *
 * Gasless Transaction Relayer — The Hackathon Secret Sauce 🚀
 *
 * Architecture (Devnet MVP):
 * ┌───────────┐        ┌───────────────┐       ┌──────────┐
 * │  User     │ ──→    │  App (Relayer) │ ──→   │  Solana  │
 * │  (Signs)  │        │  (Pays Gas)    │       │  Devnet  │
 * └───────────┘        └───────────────┘       └──────────┘
 *
 * Flow:
 *   1. Build the instruction(s) (transfer ECO, update Tree NFT, etc.)
 *   2. Set `feePayer` = relayer Keypair (NOT user)
 *   3. Relayer signs first → serialized with relayer sig
 *   4. User signs via MWA / Seed Vault (biometric only, zero gas)
 *   5. Both signatures present → send to Solana RPC
 *
 * Production: Replace the local Keypair with a secure backend API
 * that signs the transaction server-side (e.g. Firebase Cloud Function + KMS).
 */

import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { getConnection } from "../shared/lib/rpcConnection";

// ── Relayer Keypair (Devnet MVP only) ─────────────────────────────────────────
//
// ⚠️ DEVNET ONLY — In production, the relayer lives on a secure backend.
// This keypair is auto-generated on first import and funded via requestAirdrop.
// The relayer's sole purpose is pay transaction fees (~5000 lamports each).
//
let _relayerKeypair: Keypair | null = null;
let _relayerFunded = false;

export function getRelayerKeypair(): Keypair {
  if (!_relayerKeypair) {
    _relayerKeypair = Keypair.generate();
    console.log(
      `[GaslessRelayer] Devnet relayer created: ${_relayerKeypair.publicKey.toBase58()}`
    );
  }
  return _relayerKeypair;
}

export function getRelayerPublicKey(): PublicKey {
  return getRelayerKeypair().publicKey;
}

/**
 * Ensure the relayer has enough SOL for ~200 gasless tx (~0.001 SOL = 1M lamports).
 * Uses requestAirdrop on devnet. Idempotent — skips if already funded.
 */
export async function ensureRelayerFunded(): Promise<void> {
  if (_relayerFunded) return;

  const relayer = getRelayerKeypair();
  const connection = await getConnection();

  try {
    const balance = await connection.getBalance(relayer.publicKey);
    if (balance >= 0.001 * LAMPORTS_PER_SOL) {
      _relayerFunded = true;
      console.log(`[GaslessRelayer] Already funded: ${balance / LAMPORTS_PER_SOL} SOL`);
      return;
    }

    console.log(`[GaslessRelayer] Requesting airdrop for relayer...`);
    const sig = await connection.requestAirdrop(
      relayer.publicKey,
      0.05 * LAMPORTS_PER_SOL // ~50 devnet transactions worth
    );
    await connection.confirmTransaction(sig, "confirmed");
    _relayerFunded = true;
    console.log(`[GaslessRelayer] Funded! 0.05 SOL → ${relayer.publicKey.toBase58()}`);
  } catch (err: any) {
    console.warn(`[GaslessRelayer] Airdrop failed (may already have SOL):`, err?.message);
    // Don't block — relayer may already be funded from a previous session
    _relayerFunded = true;
  }
}

// ── Transaction Builder ───────────────────────────────────────────────────────

export interface GaslessTxOptions {
  /** The instructions the USER is authorizing */
  instructions: TransactionInstruction[];
  /** The user's public key (signer, NOT fee payer) */
  userPublicKey: PublicKey;
  /** Optional: Add priority fee instruction for faster landing */
  priorityFee?: number;
}

/**
 * Build a gasless transaction where the RELAYER pays the fee.
 *
 * Returns a Transaction that is:
 *  - Partially signed by the relayer (fee payer)
 *  - Ready for the user to sign via MWA
 *
 * @returns {Transaction} partially-signed transaction
 */
export async function buildGaslessTransaction(
  options: GaslessTxOptions
): Promise<Transaction> {
  const { instructions, userPublicKey, priorityFee } = options;
  const relayer = getRelayerKeypair();
  const connection = await getConnection();

  // Ensure relayer can pay
  await ensureRelayerFunded();

  // Fetch fresh blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  // Build the Transaction
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  // 🎯 THE KEY: feePayer = relayer, NOT the user
  tx.feePayer = relayer.publicKey;

  // Optional: Add compute budget for priority fee (faster tx landing)
  if (priorityFee && priorityFee > 0) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee,
      })
    );
  }

  // Add the user's actual instructions
  for (const ix of instructions) {
    tx.add(ix);
  }

  // 🔐 Relayer signs FIRST (covers gas)
  tx.partialSign(relayer);

  console.log(
    `[GaslessRelayer] TX built | feePayer=${relayer.publicKey.toBase58().slice(0, 8)}… | user=${userPublicKey.toBase58().slice(0, 8)}… | ixs=${instructions.length}`
  );

  return tx;
}

// ── Send Helpers ──────────────────────────────────────────────────────────────

/**
 * Send a fully-signed gasless transaction to the network.
 * Both relayer + user signatures must be present.
 */
export async function sendGaslessTransaction(
  signedTx: Transaction
): Promise<string> {
  const connection = await getConnection();

  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });

  console.log(`[GaslessRelayer] TX sent: ${signature.slice(0, 16)}…`);

  // Confirm with timeout
  const result = await connection.confirmTransaction(
    {
      signature,
      blockhash: signedTx.recentBlockhash!,
      lastValidBlockHeight: signedTx.lastValidBlockHeight!,
    },
    "confirmed"
  );

  if (result.value.err) {
    throw new Error(
      `Transaction failed: ${JSON.stringify(result.value.err)}`
    );
  }

  console.log(`[GaslessRelayer] ✅ Confirmed: ${signature.slice(0, 16)}…`);
  return signature;
}

// ── Convenience: ECO Token Claim ──────────────────────────────────────────────

/**
 * Build a gasless "Claim ECO" transaction.
 *
 * For Devnet MVP, this performs a memo-anchored system transfer from relayer → user
 * to simulate the token claim. In production, replace with:
 *   - SPL Token `mintTo` from a mint authority
 *   - OR Anchor instruction to your EcoQuest program
 */
export async function buildClaimEcoTransaction(
  userPublicKey: PublicKey,
  ecoAmount: number
): Promise<Transaction> {
  // For MVP: relayer sends a tiny lamport tx (0.000001 SOL) with memo
  // representing the ECO token claim on-chain
  const relayer = getRelayerKeypair();

  const memoIx = new TransactionInstruction({
    keys: [],
    programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    data: Buffer.from(
      JSON.stringify({
        action: "claim_eco",
        amount: ecoAmount,
        timestamp: Date.now(),
        user: userPublicKey.toBase58(),
      })
    ),
  });

  // Tiny transfer to make it a "real" transaction with state change
  const transferIx = SystemProgram.transfer({
    fromPubkey: relayer.publicKey,
    toPubkey: userPublicKey,
    lamports: 1, // 1 lamport (basically nothing)
  });

  return buildGaslessTransaction({
    instructions: [memoIx, transferIx],
    userPublicKey,
  });
}
