/**
 * hooks/useClaimEco.ts
 *
 * High-level hook: Claim ECO token rewards via gasless transaction.
 *
 * Combines:
 *  - useGaslessTransaction (fee-sponsored flow)
 *  - buildClaimEcoTransaction (memo + micro-transfer)
 *  - QuestContext (update local ECO balance)
 *
 * Usage in screens:
 *   const { claimEco, stage, isProcessing } = useClaimEco();
 *   await claimEco(80); // claims 80 ECO, user signs with biometric, zero gas
 */

import { useState, useCallback } from "react";
import { PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { useWallet } from "../contexts/WalletContext";
import { useGaslessTransaction, GaslessStage } from "./useGaslessTransaction";
import { getRelayerKeypair, ensureRelayerFunded } from "../services/gaslessRelayer";

// Memo program ID (official Solana Memo v2)
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function useClaimEco() {
  const { publicKeyBase58 } = useWallet();
  const { executeGasless, stage, isProcessing, error, lastSignature, reset } =
    useGaslessTransaction();

  /**
   * Claim ECO tokens via a gasless on-chain transaction.
   *
   * On-chain proof:
   *  - Memo instruction with { action: "claim_eco", amount, user, timestamp }
   *  - Micro-transfer from relayer → user (1 lamport) for state change
   *
   * The user signs with biometric ONLY (zero SOL needed).
   *
   * @param ecoAmount - Number of ECO points to claim
   * @param questId  - Optional quest ID for traceability
   * @returns Transaction signature
   */
  const claimEco = useCallback(
    async (ecoAmount: number, questId?: string): Promise<string> => {
      if (!publicKeyBase58) throw new Error("Wallet not connected");

      const userPubkey = new PublicKey(publicKeyBase58);
      const relayer = getRelayerKeypair();

      // Fund relayer if needed
      await ensureRelayerFunded();

      // ── Build claim instructions ──────────────────────────────────────────

      // 1. Memo — on-chain proof of ECO claim
      const memoData = JSON.stringify({
        action: "claim_eco",
        eco: ecoAmount,
        quest: questId ?? null,
        user: publicKeyBase58,
        ts: Date.now(),
        app: "ecoquest",
      });

      const memoIx = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoData),
      });

      // 2. Micro-transfer (1 lamport relayer → user) for state proof
      const transferIx = SystemProgram.transfer({
        fromPubkey: relayer.publicKey,
        toPubkey: userPubkey,
        lamports: 1,
      });

      // ── Execute gasless ────────────────────────────────────────────────────
      const signature = await executeGasless([memoIx, transferIx]);

      console.log(
        `[useClaimEco] ✅ Claimed ${ecoAmount} ECO | sig=${signature.slice(0, 16)}…`
      );

      return signature;
    },
    [publicKeyBase58, executeGasless]
  );

  return {
    /** Claim ECO tokens gaslessly */
    claimEco,
    /** Current stage of the claim process */
    stage,
    /** Whether a claim is in progress */
    isProcessing,
    /** Error message if claim failed */
    error,
    /** Last successful tx signature */
    lastSignature,
    /** Reset hook state */
    reset,
  };
}
