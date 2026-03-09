/**
 * hooks/useGaslessTransaction.ts
 *
 * React hook for executing gasless (sponsored) transactions via MWA.
 *
 * Usage:
 *   const { executeGasless, isProcessing, error } = useGaslessTransaction();
 *   await executeGasless(instructions);
 *
 * The user NEVER pays gas — the relayer covers all fees.
 * User only signs via biometric / Seed Vault to authorize the action.
 */

import { useState, useCallback, useRef } from "react";
import { Alert } from "react-native";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import {
  buildGaslessTransaction,
  sendGaslessTransaction,
  getRelayerPublicKey,
} from "../services/gaslessRelayer";
import { useWallet } from "../contexts/WalletContext";
import { useWalletStore } from "../entities/wallet/model/walletStore";
import { MWA_CONFIG } from "../shared/config/mwa";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GaslessStage =
  | "idle"
  | "building"      // Constructing the transaction
  | "signing"       // Waiting for MWA / biometric
  | "sending"       // Broadcasting to Solana
  | "confirming"    // Waiting for confirmation
  | "done"          // Success
  | "error";        // Failed

export interface GaslessResult {
  signature: string;
  stage: "done";
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGaslessTransaction() {
  const { publicKeyBase58 } = useWallet();
  const authToken = useWalletStore((s) => s.authToken);
  const [stage, setStage] = useState<GaslessStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const signingRef = useRef(false); // Concurrency guard

  const isProcessing = stage !== "idle" && stage !== "done" && stage !== "error";

  /**
   * Execute a gasless transaction.
   */
  const executeGasless = useCallback(
    async (
      instructions: TransactionInstruction[],
      options?: { priorityFee?: number; onStageChange?: (s: GaslessStage) => void }
    ): Promise<string> => {
      if (!publicKeyBase58) {
        throw new Error("Wallet not connected");
      }

      // ── Concurrency guard ──────────────────────────────────────────────
      if (signingRef.current) {
        throw new Error("A transaction is already in progress. Please wait.");
      }
      signingRef.current = true;

      const userPubkey = new PublicKey(publicKeyBase58);
      const notify = options?.onStageChange;

      try {
        // ── 1. Build gasless TX (relayer signs first) ──────────────────────
        setStage("building");
        notify?.("building");

        const partiallySignedTx = await buildGaslessTransaction({
          instructions,
          userPublicKey: userPubkey,
          priorityFee: options?.priorityFee,
        });

        // ── 2. User signs via MWA (biometric / Seed Vault) ────────────────
        setStage("signing");
        notify?.("signing");

        const fullySignedTx = await transact(async (wallet) => {
          // Try reauthorize first (cached token — no approval popup)
          try {
            if (authToken) {
              await wallet.reauthorize({
                auth_token: authToken,
                identity: MWA_CONFIG.appIdentity,
              });
            } else {
              throw new Error("No auth token");
            }
          } catch {
            // Token expired or missing — full authorization
            await wallet.authorize({
              cluster: MWA_CONFIG.cluster,
              identity: MWA_CONFIG.appIdentity,
            });
          }

          const signedTxs = await wallet.signTransactions({
            transactions: [partiallySignedTx],
          });

          return signedTxs[0] as Transaction;
        });

        // ── 3. Send to Solana ─────────────────────────────────────────────
        setStage("sending");
        notify?.("sending");

        const signature = await sendGaslessTransaction(fullySignedTx);

        // ── 4. Done ───────────────────────────────────────────────────────
        setStage("done");
        notify?.("done");
        setLastSignature(signature);
        setError(null);

        return signature;
      } catch (err: any) {
        console.error("[useGaslessTransaction] Error:", err);
        setStage("error");
        notify?.("error");

        const message =
          err?.message?.includes("User rejected") || err?.message?.includes("declined")
            ? "Transaction dibatalkan oleh pengguna."
            : err?.message ?? "Gasless transaction gagal.";

        setError(message);
        throw new Error(message);
      } finally {
        // ── Always clean up — user can retry immediately ─────────────
        signingRef.current = false;
      }
    },
    [publicKeyBase58, authToken]
  );

  /**
   * Reset the hook state back to idle.
   */
  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
    setLastSignature(null);
  }, []);

  return {
    /** Execute a gasless transaction with the given instructions */
    executeGasless,
    /** Current processing stage */
    stage,
    /** Whether a transaction is currently in progress */
    isProcessing,
    /** Error message if failed */
    error,
    /** Last successful transaction signature */
    lastSignature,
    /** Relayer public key (for display/debugging) */
    relayerPublicKey: getRelayerPublicKey(),
    /** Reset state back to idle */
    reset,
  };
}
