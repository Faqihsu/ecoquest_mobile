/**
 * QuestDetailScreen.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Layar detail quest yang mengintegrasikan ProofOfActivityScreen dari
 * features/proof-of-activity — pipeline lengkap:
 *
 *   Phase 1: Info Quest + tombol "Mulai Verifikasi"
 *   Phase 2: ProofOfActivityScreen
 *     └─ GPS anti-spoof (7-layer) → Kamera in-app (SHA-256) → IPFS upload
 *        └─ useQuestActions.claimNftProof → Anchor tx (useSolanaTransaction)
 *
 * signTransaction menggunakan createMwaSignFn() yang konsisten dengan
 * pattern useStaking.ts (MWA_CONFIG, reauthorize setiap call).
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { Transaction } from "@solana/web3.js";

import { ProofOfActivityScreen } from "../features/proof-of-activity";
import { useWallet } from "../contexts/WalletContext";
import { Colors } from "../utils/colors";
import { MWA_CONFIG } from "../shared/config/mwa";
import { useWalletStore } from "../entities/wallet/model/walletStore";
import type { MwaSignFn } from "../hooks/useSolanaTransaction";

const { width: SW } = Dimensions.get("window");

// ─── Types ───────────────────────────────────────────────────────────────────

interface Quest {
  id: string;
  title: string;
  description: string;
  icon: string;
  rewardSKR: number;
  hasNFT: boolean;
  distanceKm: number;
  difficulty: "Mudah" | "Sedang" | "Sulit";
}

// ─── MWA Sign Helper — reauthorize first, authorize fallback ─────────────────

function createMwaSignFn(): MwaSignFn {
  const authToken = useWalletStore.getState().authToken;
  return async (transaction: Transaction): Promise<Transaction> => {
    return transact(async (wallet: Web3MobileWallet) => {
      try {
        if (authToken) {
          await wallet.reauthorize({
            auth_token: authToken,
            identity: MWA_CONFIG.appIdentity,
          });
        } else {
          throw new Error('No auth token');
        }
      } catch {
        await wallet.authorize({
          cluster: MWA_CONFIG.cluster,
          identity: MWA_CONFIG.appIdentity,
        });
      }
      const [signed] = await wallet.signTransactions({
        transactions: [transaction],
      });
      return signed as unknown as Transaction;
    });
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function difficultyColor(d: Quest["difficulty"]) {
  return d === "Mudah"
    ? Colors.accent.primary
    : d === "Sedang"
    ? Colors.secondary.orange
    : "#ef4444";
}

// ─── Phase 1: Quest Info ──────────────────────────────────────────────────────

function QuestInfoPhase({
  quest,
  onStart,
  onBack,
}: {
  quest: Quest;
  onStart: () => void;
  onBack: () => void;
}) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detail Quest</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Quest card */}
        <View style={styles.questCard}>
          <Text style={styles.questEmoji}>{quest.icon}</Text>
          <Text style={styles.questTitle}>{quest.title}</Text>

          <View style={styles.badgeRow}>
            <View style={[styles.diffBadge, { backgroundColor: difficultyColor(quest.difficulty) + "22" }]}>
              <Text style={[styles.diffText, { color: difficultyColor(quest.difficulty) }]}>
                {quest.difficulty}
              </Text>
            </View>
            <View style={styles.distBadge}>
              <Feather name="map-pin" size={12} color={Colors.text.muted} />
              <Text style={styles.distText}> {quest.distanceKm} km</Text>
            </View>
          </View>

          <Text style={styles.questDesc}>{quest.description}</Text>

          <View style={styles.rewardRow}>
            <View style={styles.rewardPill}>
              <Text style={styles.rewardLabel}>🎁 Reward</Text>
              <Text style={styles.rewardValue}>{quest.rewardSKR} SKR</Text>
            </View>
            {quest.hasNFT && (
              <View style={styles.nftPill}>
                <Ionicons name="diamond-outline" size={13} color={Colors.secondary.teal} />
                <Text style={styles.nftText}> NFT Proof</Text>
              </View>
            )}
          </View>
        </View>

        {/* Pipeline card */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>🔍 Proses Verifikasi</Text>
          {[
            { icon: "🛰️", label: "GPS", desc: "Validasi koordinat real-time (anti-mock 7-layer)" },
            { icon: "📷", label: "Foto", desc: "Ambil bukti foto (SHA-256 integrity hash)" },
            { icon: "☁️", label: "Upload", desc: "Pinata IPFS / Irys Arweave (fallback 3x retry)" },
            { icon: "⛓️", label: "On-chain", desc: "Bukti dikirim ke Solana sebagai NFT Proof" },
          ].map((s) => (
            <View key={s.label} style={styles.stepItem}>
              <Text style={styles.stepEmoji}>{s.icon}</Text>
              <View>
                <Text style={styles.stepLabel}>{s.label}</Text>
                <Text style={styles.stepDesc}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.startBtn} onPress={onStart} activeOpacity={0.85}>
          <Ionicons name="navigate" size={18} color={Colors.background.dark} />
          <Text style={styles.startBtnText}>  Mulai Verifikasi</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function QuestDetailScreen({ navigation, route }: any) {
  const quest: Quest = route.params?.quest ?? {
    id: "unknown",
    title: "Quest",
    description: "",
    icon: "🌿",
    rewardSKR: 0,
    hasNFT: false,
    distanceKm: 0,
    difficulty: "Mudah",
  };

  const { publicKey, isDemoMode } = useWallet();
  const [showProof, setShowProof] = useState(false);

  /**
   * signTransaction using the same createMwaSignFn() pattern as useStaking.ts.
   * Demo mode returns the tx unsigned (no actual submission).
   */
  const signTransaction = useCallback((): MwaSignFn => {
    if (isDemoMode || !publicKey) {
      return async (tx: Transaction) => {
        console.warn("[QuestDetail] Demo mode — skipping real MWA signing");
        return tx;
      };
    }
    return createMwaSignFn();
  }, [publicKey, isDemoMode]);

  const handleSuccess = useCallback(
    (signature: string, metadataUri: string) => {
      Alert.alert(
        "🎉 Bukti Dikirim!",
        `Aktivitasmu kini tersimpan on-chain.\n\nTX: ${signature.slice(0, 20)}...`,
        [{ text: "Kembali ke Quest", onPress: () => navigation.goBack() }]
      );
    },
    [navigation]
  );

  const handleCancel = useCallback(() => {
    if (showProof) {
      setShowProof(false);
    } else {
      navigation.goBack();
    }
  }, [showProof, navigation]);

  // Phase 2 — delegate to ProofOfActivityScreen (full pipeline)
  if (showProof) {
    return (
      <ProofOfActivityScreen
        questId={quest.id}
        userPublicKey={publicKey}
        signTransaction={signTransaction()}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    );
  }

  // Phase 1 — quest info
  return (
    <QuestInfoPhase
      quest={quest}
      onStart={() => setShowProof(true)}
      onBack={() => navigation.goBack()}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background.dark },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.medium,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.background.card,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: Colors.border.medium,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.text.primary },
  scroll: { padding: 20, paddingBottom: 48 },

  // ── Quest Card ──
  questCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: Colors.border.medium,
    alignItems: "center", marginBottom: 16,
  },
  questEmoji: { fontSize: 52, marginBottom: 12 },
  questTitle: {
    fontSize: 20, fontWeight: "800", color: Colors.text.primary,
    textAlign: "center", marginBottom: 10, letterSpacing: -0.3,
  },
  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  diffBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  diffText: { fontSize: 12, fontWeight: "700" },
  distBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.background.darker,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  distText: { fontSize: 12, color: Colors.text.muted, fontWeight: "600" },
  questDesc: {
    fontSize: 14, color: Colors.text.secondary,
    textAlign: "center", lineHeight: 20, marginBottom: 16,
  },
  rewardRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  rewardPill: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(245, 158, 11, 0.25)", alignItems: "center",
  },
  rewardLabel: { fontSize: 11, color: Colors.secondary.orange, fontWeight: "600" },
  rewardValue: { fontSize: 15, fontWeight: "800", color: Colors.secondary.orange },
  nftPill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.overlay.tealLight,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(20, 184, 166, 0.25)",
  },
  nftText: { fontSize: 13, fontWeight: "700", color: Colors.secondary.teal },

  // ── Pipeline Steps ──
  stepsCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: Colors.border.medium,
  },
  stepsTitle: { fontSize: 14, fontWeight: "700", color: Colors.text.primary, marginBottom: 14 },
  stepItem: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  stepEmoji: { fontSize: 20, width: 26 },
  stepLabel: { fontSize: 13, fontWeight: "700", color: Colors.text.primary, marginBottom: 2 },
  stepDesc: { fontSize: 12, color: Colors.text.secondary, maxWidth: SW - 120 },

  // ── Start Button ──
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.accent.primary, borderRadius: 16, paddingVertical: 16,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 8,
  },
  startBtnText: {
    fontSize: 16, fontWeight: "800",
    color: Colors.background.dark, letterSpacing: 0.2,
  },
});
