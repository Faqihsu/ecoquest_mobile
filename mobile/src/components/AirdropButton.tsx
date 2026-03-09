/**
 * AirdropButton.tsx
 *
 * Floating action button that appears when the user's SOL balance < 0.05.
 * Requests 1 SOL airdrop from the Devnet faucet so hackathon judges
 * can immediately test on-chain features without friction.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useSolanaConnection } from "./AppWalletProvider";
import { useWallet } from "../contexts/WalletContext";

const MIN_SOL_BALANCE = 0.02;
const AIRDROP_AMOUNT = 1 * LAMPORTS_PER_SOL; // 1 SOL

export default function AirdropButton() {
  const { connection } = useSolanaConnection();
  const { publicKeyBase58, connected } = useWallet();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [justAirdropped, setJustAirdropped] = useState(false);

  // Poll SOL balance
  useEffect(() => {
    if (!publicKeyBase58 || !connected) {
      setSolBalance(null);
      return;
    }

    let cancelled = false;

    const fetchBalance = async () => {
      try {
        const pk = new PublicKey(publicKeyBase58);
        const lamports = await connection.getBalance(pk);
        if (!cancelled) {
          setSolBalance(lamports / LAMPORTS_PER_SOL);
        }
      } catch {
        // Silently fail — will retry on next interval
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10_000); // Every 10s

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicKeyBase58, connected, connection, justAirdropped]);

  const handleAirdrop = useCallback(async () => {
    if (!publicKeyBase58 || loading) return;

    setLoading(true);
    try {
      const pk = new PublicKey(publicKeyBase58);
      const signature = await connection.requestAirdrop(pk, AIRDROP_AMOUNT);
      await connection.confirmTransaction(signature, "confirmed");

      // Refresh balance
      const lamports = await connection.getBalance(pk);
      setSolBalance(lamports / LAMPORTS_PER_SOL);
      setJustAirdropped(true);

      Alert.alert(
        "✅ Airdrop Berhasil!",
        `1 SOL telah dikirim ke wallet Anda di Devnet.\n\nSignature: ${signature.slice(0, 20)}...`
      );
    } catch (err: any) {
      const msg = err?.message ?? "Airdrop gagal. Coba lagi dalam beberapa detik.";
      Alert.alert("❌ Airdrop Gagal", msg);
    } finally {
      setLoading(false);
    }
  }, [publicKeyBase58, connection, loading]);

  // Don't show if not connected, or balance is sufficient
  if (!connected || !publicKeyBase58) return null;
  if (solBalance !== null && solBalance >= MIN_SOL_BALANCE) return null;

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handleAirdrop}
      activeOpacity={0.8}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.text}>💰 Airdrop 1 SOL</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    bottom: 100,
    right: 16,
    zIndex: 9998,
    backgroundColor: "rgba(153, 69, 255, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(153, 69, 255, 0.6)",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: "#9945ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
});
