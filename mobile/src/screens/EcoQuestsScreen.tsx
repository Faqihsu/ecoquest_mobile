/**
 * EcoQuestsScreen.tsx
 *
 * Shows all user-created quests (completed activities with photo proof).
 * Users can create new quests via the "Buat Quest" FAB → CreateQuestScreen.
 */

import React, { useCallback } from "react";
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, RefreshControl, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "../utils/colors";
import { useWallet } from "../contexts/WalletContext";
import {
  useQuests, UserQuest, CATEGORY_ICONS, ECO_REWARDS,
} from "../contexts/QuestContext";

// ── Quest item card ───────────────────────────────────────────────────────────

function QuestCard({ quest, onDelete }: { quest: UserQuest; onDelete: () => void }) {
  const date = new Date(quest.completedAt).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <View style={s.card}>
      {/* Proof photo thumbnail */}
      {quest.proofPhotoUri ? (
        <Image source={{ uri: quest.proofPhotoUri }} style={s.thumb} resizeMode="cover" />
      ) : (
        <View style={[s.thumb, s.thumbPlaceholder]}>
          <Text style={{ fontSize: 28 }}>{CATEGORY_ICONS[quest.category]}</Text>
        </View>
      )}

      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <Text style={s.cardTitle} numberOfLines={2}>{quest.title}</Text>
          <View style={s.ecoChip}>
            <Text style={s.ecoChipText}>+{quest.ecoReward}</Text>
          </View>
        </View>

        <View style={s.cardMeta}>
          <Text style={s.catTag}>{CATEGORY_ICONS[quest.category]} {quest.category}</Text>
          <Text style={s.dateText}>📅 {date}</Text>
        </View>

        {quest.latitude && (
          <Text style={s.locationText}>
            📍 {quest.latitude.toFixed(4)}, {quest.longitude?.toFixed(4)}
          </Text>
        )}
      </View>

      <TouchableOpacity style={s.deleteBtn} onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="trash-outline" size={16} color="#666" />
      </TouchableOpacity>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onCreatePress }: { onCreatePress: () => void }) {
  return (
    <View style={s.emptyContainer}>
      <Text style={s.emptyEmoji}>🌿</Text>
      <Text style={s.emptyTitle}>Belum Ada Quest</Text>
      <Text style={s.emptyText}>
        Buat quest pertamamu! Lakukan aktivitas eco-friendly, ambil foto bukti, dan klaim ECO Points.
      </Text>
      <TouchableOpacity style={s.createBtnEmpty} onPress={onCreatePress}>
        <Ionicons name="add-circle" size={18} color="#000" />
        <Text style={s.createBtnEmptyText}>Buat Quest Pertama</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function EcoQuestsScreen() {
  const navigation = useNavigation<any>();
  const { connected, publicKeyBase58 } = useWallet();
  const { userQuests, totalEcoPoints, isLoading, deleteQuest, refresh } = useQuests();

  const handleCreate = useCallback(() => {
    if (!connected) {
      Alert.alert("Wallet Diperlukan", "Hubungkan wallet Solana untuk mulai membuat quest.");
      return;
    }
    navigation.navigate("CreateQuest");
  }, [connected, navigation]);

  const handleDelete = useCallback((id: string, title: string) => {
    Alert.alert(
      "Hapus Quest?",
      `"${title}" akan dihapus secara permanen.`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Hapus", style: "destructive", onPress: async () => {
          try {
            await deleteQuest(id);
          } catch (err: any) {
            Alert.alert("Gagal Menghapus", err?.message ?? "Terjadi kesalahan saat menghapus quest.");
          }
        }},
      ]
    );
  }, [deleteQuest]);

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>🌿 Quest Saya</Text>
            <Text style={s.headerSub}>
              {userQuests.length} quest selesai
            </Text>
          </View>
          {/* ECO Points total */}
          <View style={s.ecoBadge}>
            <Text style={s.ecoLabel}>ECO Points</Text>
            <Text style={s.ecoTotal}>{totalEcoPoints.toLocaleString()}</Text>
          </View>
        </View>

        {/* Future token conversion notice */}
        <View style={s.conversionBanner}>
          <Text style={s.conversionIcon}>🚀</Text>
          <Text style={s.conversionText}>
            ECO Points akan dapat diconvert ke token ECO di mainnet. Stay tuned!
          </Text>
        </View>

        {/* Quest list */}
        <FlatList
          data={userQuests}
          keyExtractor={(q) => q.id}
          contentContainerStyle={[s.list, userQuests.length === 0 && { flex: 1 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={Colors.accent.primary} />
          }
          ListEmptyComponent={<EmptyState onCreatePress={handleCreate} />}
          renderItem={({ item }) => (
            <QuestCard
              quest={item}
              onDelete={() => handleDelete(item.id, item.title)}
            />
          )}
          ListFooterComponent={userQuests.length > 0 ? <View style={{ height: 100 }} /> : null}
        />

        {/* FAB: Create Quest */}
        {userQuests.length > 0 && (
          <TouchableOpacity style={s.fab} onPress={handleCreate} activeOpacity={0.85}>
            <Ionicons name="add" size={28} color="#000" />
          </TouchableOpacity>
        )}

      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080f1a" },

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 12, color: "#666", marginTop: 2 },

  ecoBadge: {
    backgroundColor: "rgba(0,255,135,0.1)", borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, alignItems: "center",
    borderWidth: 1, borderColor: "rgba(0,255,135,0.25)",
  },
  ecoLabel: { fontSize: 10, color: "#888", fontWeight: "600", textTransform: "uppercase" },
  ecoTotal: { fontSize: 22, fontWeight: "800", color: Colors.accent.primary },

  conversionBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: "rgba(102,126,234,0.1)", borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: "rgba(102,126,234,0.25)",
  },
  conversionIcon: { fontSize: 20 },
  conversionText: { flex: 1, fontSize: 12, color: "#8fa3c8", lineHeight: 17 },

  list: { paddingHorizontal: 20, gap: 14 },

  // Quest card
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(0,255,135,0.12)",
    flexDirection: "row",
  },
  thumb: { width: 90, height: 90 },
  thumbPlaceholder: { backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, padding: 12 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: "#e2e8f0", lineHeight: 19 },
  ecoChip: {
    backgroundColor: "rgba(0,255,135,0.15)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "rgba(0,255,135,0.3)",
  },
  ecoChipText: { fontSize: 11, fontWeight: "800", color: Colors.accent.primary },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  catTag: { fontSize: 11, color: "#888", fontWeight: "600" },
  dateText: { fontSize: 10, color: "#666" },
  locationText: { fontSize: 10, color: "#555" },
  deleteBtn: { padding: 12, justifyContent: "flex-start" },

  // Empty state
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
  emptyText: { fontSize: 14, color: "#888", textAlign: "center", lineHeight: 21 },
  createBtnEmpty: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.accent.primary, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 24, marginTop: 8,
  },
  createBtnEmptyText: { fontSize: 15, fontWeight: "800", color: "#000" },

  // FAB
  fab: {
    position: "absolute", bottom: 24, right: 20,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.accent.primary,
    alignItems: "center", justifyContent: "center",
    elevation: 8,
    shadowColor: Colors.accent.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
});
