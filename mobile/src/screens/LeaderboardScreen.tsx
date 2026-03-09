/**
 * LeaderboardScreen.tsx
 * Full global leaderboard using real Helius getTokenLargestAccounts
 * — top SKR holders on devnet, refreshable, with rank medals.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../utils/colors";
import { useWallet } from "../contexts/WalletContext";
import { useLeaderboard, type LeaderboardEntry } from "../hooks/useSolanaData";
import { SKR_MINT_ADDRESS } from "../shared/config/constants";

const RANK_MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const AVATARS = ["🦁", "🐯", "🦊", "🌿", "🦅", "🐋", "🦋", "🌲", "⚡", "🔥"];

function LeaderboardRow({ item, index }: { item: LeaderboardEntry; index: number }) {
  const medal = RANK_MEDALS[item.rank];
  const rankColor = item.rank === 1 ? "#FFD700" : item.rank === 2 ? "#C0C0C0" : item.rank === 3 ? "#CD7F32" : "#64748b";

  return (
    <View style={[styles.row, item.isMe && styles.rowMe]}>
      <Text style={[styles.rank, { color: rankColor }]}>
        {medal ?? `#${item.rank}`}
      </Text>
      <Text style={styles.avatar}>{AVATARS[index % AVATARS.length]}</Text>
      <View style={styles.rowInfo}>
        <Text style={[styles.name, item.isMe && styles.nameMe]}>
          {item.displayName}{item.isMe ? " (You)" : ""}
        </Text>
        <Text style={styles.address}>{item.address.slice(0, 8)}...{item.address.slice(-4)}</Text>
      </View>
      <View style={styles.skrBadge}>
        <Text style={styles.skrAmount}>{item.skrBalance.toLocaleString()}</Text>
        <Text style={styles.skrUnit}>SKR</Text>
      </View>
    </View>
  );
}

export default function LeaderboardScreen({ navigation }: any) {
  const { publicKeyBase58 } = useWallet();
  const { leaderboard, isLoading, isError, refetch } = useLeaderboard(publicKeyBase58);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 1500);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>🏅 Leaderboard Global</Text>
            <Text style={styles.subtitle}>Top SKR Holders · Solana Devnet</Text>
          </View>
        </View>

        {/* No mint configured */}
        {!SKR_MINT_ADDRESS && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color="#f97316" />
            <Text style={styles.warningText}> SKR Mint belum dikonfigurasi di .env</Text>
          </View>
        )}

        {/* List */}
        {isLoading && !refreshing ? (
          <ActivityIndicator color={Colors.accent.primary} size="large" style={{ marginTop: 40 }} />
        ) : isError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>⚠️ Gagal memuat leaderboard</Text>
            <TouchableOpacity onPress={refetch} style={styles.retryBtn}>
              <Text style={styles.retryText}>Coba Lagi</Text>
            </TouchableOpacity>
          </View>
        ) : leaderboard.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>📭</Text>
            <Text style={styles.emptyTitle}>Belum Ada Data</Text>
            <Text style={styles.emptyText}>
              {SKR_MINT_ADDRESS
                ? "Tidak ada holder SKR yang ditemukan di devnet."
                : "Konfigurasi SKR_MINT di .env terlebih dahulu."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={leaderboard}
            keyExtractor={(item) => item.address}
            renderItem={({ item, index }) => <LeaderboardRow item={item} index={index} />}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.accent.primary} />
            }
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Text style={styles.listHeaderText}>🔵 Live data setiap 2 menit</Text>
              </View>
            }
          />
        )}

        {/* Info footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            💡 Rank berdasarkan total SKR token. Stake lebih banyak untuk naik peringkat!
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.dark },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border.medium },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "bold", color: Colors.text.primary },
  subtitle: { fontSize: 11, color: Colors.text.muted, marginTop: 2 },

  warningBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(249,115,22,0.12)", paddingHorizontal: 16, paddingVertical: 10, borderLeftWidth: 3, borderLeftColor: "#f97316" },
  warningText: { fontSize: 12, color: "#f97316", fontWeight: "500" },

  list: { padding: 16 },
  listHeader: { marginBottom: 10 },
  listHeaderText: { fontSize: 11, color: Colors.text.muted, textAlign: "center" },

  row: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.background.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border.medium, gap: 10 },
  rowMe: { borderColor: Colors.accent.primary, backgroundColor: "rgba(16,217,129,0.07)" },
  rank: { fontSize: 18, fontWeight: "800", width: 36, textAlign: "center" },
  avatar: { fontSize: 24 },
  rowInfo: { flex: 1 },
  name: { fontSize: 14, fontWeight: "700", color: Colors.text.primary },
  nameMe: { color: Colors.accent.primary },
  address: { fontSize: 10, color: Colors.text.muted, marginTop: 2, fontFamily: "monospace" },
  skrBadge: { alignItems: "flex-end" },
  skrAmount: { fontSize: 16, fontWeight: "800", color: "#f59e0b" },
  skrUnit: { fontSize: 10, color: Colors.text.muted },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: Colors.text.primary, marginBottom: 8 },
  emptyText: { fontSize: 13, color: Colors.text.muted, textAlign: "center" },
  errorText: { fontSize: 15, color: "#ef4444", marginBottom: 16 },
  retryBtn: { backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: Colors.text.primary, fontWeight: "600" },

  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border.dark },
  footerText: { fontSize: 11, color: Colors.text.muted, textAlign: "center" },
});
