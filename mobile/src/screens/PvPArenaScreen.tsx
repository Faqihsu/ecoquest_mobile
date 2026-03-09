import { Colors } from "../utils/colors";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  Animated,
} from "react-native";

import { useWallet } from "../contexts/WalletContext";
import { useMWASign } from "../hooks/useMWASign";
import {
  pvpWebSocketService,
  Duel,
  BattleResult,
} from "../services/PvPWebSocketService";
import { createDuel, acceptDuel } from "../services/PvPService";

// History entry type
interface HistoryEntry {
  id: string;
  opponent: string;
  result: "WIN" | "LOSS";
  reward: number;
  date: string;
}

const PvPArenaScreen = ({ navigation }: any) => {
  const { connected, publicKeyBase58, publicKey } = useWallet();
  const { signTransaction } = useMWASign();
  const [activeTab, setActiveTab] = useState<"open" | "history">("open");

  // Live state — populated from real fetchOpenDuels() + WebSocket events
  const [duels, setDuels] = useState<Duel[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected" | "reconnecting">("connecting");
  const [pendingDuelId, setPendingDuelId] = useState<string | null>(null);

  // Pulsing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // ── WebSocket lifecycle ───────────────────────────────────────────────────

  // ── Load initial open duels from chain ────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchOpenDuels } = await import("../services/PvPService");
        const onChainDuels = await fetchOpenDuels();
        if (!cancelled && onChainDuels.length > 0) {
          setDuels(
            onChainDuels.map((d) => ({
              id: `duel-${d.duelIndex}`,
              challenger: d.challenger,
              challengerAlias: `${d.challenger.slice(0, 4)}...${d.challenger.slice(-4)}`,
              challengerWins: 0,
              stake: d.stakeAmount / 1_000_000,
              nftPower: d.challengerNftId,
              difficulty: 'medium' as const,
              status: d.status,
              createdAt: d.createdAt,
            }))
          );
        }
      } catch (e) {
        console.warn("[PvP] fetchOpenDuels failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── WebSocket lifecycle ───────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = pvpWebSocketService.on((event) => {
      switch (event.type) {
        case "connection":
          setWsStatus(event.payload.status === "connected" ? "connected" : event.payload.status);
          break;

        case "duel_created":
          setDuels((prev) => {
            if (prev.find((d) => d.id === event.payload.id)) return prev;
            return [event.payload, ...prev];
          });
          break;

        case "duel_accepted":
          setDuels((prev) => prev.filter((d) => d.id !== event.payload.duelId));
          break;

        case "battle_result": {
          const result = event.payload as BattleResult;
          const won = result.winner === (publicKeyBase58 ?? "");
          if (pendingDuelId === result.duelId) {
            setPendingDuelId(null);
            Alert.alert(
              won ? "🏆 Victory!" : "💀 Defeat",
              won
                ? `You won +${result.reward} SKR!\nTx: ${result.txSignature.slice(0, 12)}...`
                : `You lost. Better luck next time.`,
            );
            if (publicKeyBase58) {
              setHistory((prev) => [
                {
                  id: result.duelId,
                  opponent: won ? result.loser : result.winner,
                  result: won ? "WIN" : "LOSS",
                  reward: won ? result.reward : -result.reward,
                  date: "Just now",
                },
                ...prev,
              ]);
            }
          }
          break;
        }
      }
    });

    pvpWebSocketService.connect();

    return () => {
      unsubscribe();
      pvpWebSocketService.disconnect();
    };
  }, [publicKeyBase58, pendingDuelId]);


  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAcceptDuel = useCallback(
    (duel: Duel) => {
      if (!connected || !publicKey) {
        Alert.alert("Not Connected", "Please connect your wallet to battle");
        return;
      }
      Alert.alert(
        "⚔️ Accept Challenge?",
        `Battle ${duel.challengerAlias} for ${duel.stake} SKR?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Accept & Sign",
            onPress: async () => {
              setPendingDuelId(duel.id);
              try {
                // Submit accept_duel on-chain, then broadcast via WebSocket
                const duelIndex = parseInt(duel.id.replace('duel-', '')) || 0;
                const sig = await acceptDuel(duelIndex, 1, publicKey, signTransaction);
                console.log(`[PvP] Accepted duel on-chain: ${sig}`);
                // Also broadcast over WS for real-time opponent notification
                pvpWebSocketService.acceptDuel(duel.id, publicKeyBase58 ?? "you");
              } catch (err: any) {
                setPendingDuelId(null);
                Alert.alert("Failed", err?.message ?? "Could not accept duel");
              }
            },
          },
        ]
      );
    },
    [connected, publicKey, publicKeyBase58, signTransaction]
  );

  const handleCreateDuel = useCallback(async () => {
    if (!connected || !publicKey) {
      Alert.alert("Not Connected", "Please connect your wallet");
      return;
    }
    try {
      // 300 SKR stake = 300 * 1e6 base units
      const { signature, duelIndex } = await createDuel(1, 300 * 1_000_000, publicKey, signTransaction);
      // Broadcast to WebSocket after on-chain confirmation
      pvpWebSocketService.createDuel({
        challenger: publicKeyBase58 ?? "you",
        challengerAlias: publicKeyBase58 ? publicKeyBase58.slice(0, 6) + "..." : "You",
        challengerWins: 0,
        stake: 300,
        difficulty: "medium",
      });
      Alert.alert("⚔️ Duel Created!", `On-chain: ${signature.slice(0, 16)}...`);
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Could not create duel");
    }
  }, [connected, publicKey, publicKeyBase58, signTransaction]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "#00ff00";
      case "medium": return "#ffaa00";
      case "hard": return "#ff4444";
      default: return "#666";
    }
  };

  const renderDuelCard = ({ item }: { item: Duel }) => {
    const isPending = pendingDuelId === item.id;
    return (
      <View style={styles.duelCard}>
        <View style={styles.duelHeader}>
          <View>
            <Text style={styles.challengerName}>{item.challengerAlias}</Text>
            <Text style={styles.winRecord}>
              {item.challengerWins} Wins · Stake: {item.stake} SKR
            </Text>
          </View>
          <View style={[styles.difficultyBadge, { backgroundColor: `${getDifficultyColor(item.difficulty)}20` }]}>
            <Text style={[styles.difficultyText, { color: getDifficultyColor(item.difficulty) }]}>
              {item.difficulty.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.nftShowcase}>
          <Text style={styles.nftTitle}>Challenger NFT Power</Text>
          <View style={styles.nftCard}>
            <Text style={styles.nftPlaceholder}>🎮</Text>
            <Text style={styles.nftStats}>Power: {Math.floor(item.stake / 10)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.acceptButton, isPending && styles.pendingButton]}
          onPress={() => handleAcceptDuel(item)}
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.acceptButtonText}>⚔️ Accept Challenge</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderHistoryCard = ({ item }: { item: HistoryEntry }) => (
    <View style={[styles.historyCard, { borderLeftColor: item.result === "WIN" ? "#00ff00" : "#ff4444" }]}>
      <View style={styles.historyLeft}>
        <Text style={styles.opponentName}>vs {item.opponent}</Text>
        <Text style={styles.historyDate}>{item.date}</Text>
      </View>
      <View style={styles.historyRight}>
        <Text style={[styles.resultText, { color: item.result === "WIN" ? "#00ff00" : "#ff4444" }]}>
          {item.result}
        </Text>
        <Text style={[styles.rewardText, { color: item.reward > 0 ? "#00ff00" : "#ff4444" }]}>
          {item.reward > 0 ? "+" : ""}{item.reward} SKR
        </Text>
      </View>
    </View>
  );

  const wins = history.filter((h) => h.result === "WIN").length;
  const losses = history.filter((h) => h.result === "LOSS").length;
  const totalEarnings = history.reduce((sum, h) => sum + h.reward, 0);

  return (
    <View style={[styles.container, { backgroundColor: Colors.background.dark }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>⚔️ PvP Arena</Text>
            {/* Live indicator */}
            <View style={styles.liveIndicator}>
              <Animated.View style={[styles.liveDot, {
                opacity: wsStatus === "connected" ? pulseAnim : 0.3,
                backgroundColor: wsStatus === "connected" ? "#00ff00"
                  : wsStatus === "reconnecting" ? "#ffaa00" : "#ff4444",
              }]} />
              <Text style={[styles.liveText, {
                color: wsStatus === "connected" ? "#00ff00"
                  : wsStatus === "reconnecting" ? "#ffaa00" : "#888",
              }]}>
                {wsStatus === "connected" ? "LIVE"
                  : wsStatus === "reconnecting" ? "RECONNECTING..."
                  : wsStatus === "connecting" ? "CONNECTING..."
                  : "OFFLINE"}
              </Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Battle NFTs for glory and rewards</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          {(["open", "history"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab === "open" ? `Open Challenges (${duels.length})` : "Battle History"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === "open" ? (
          <>
            {duels.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🏟️</Text>
                <Text style={styles.emptyText}>No open challenges right now</Text>
                <TouchableOpacity style={styles.createButton} onPress={handleCreateDuel}>
                  <Text style={styles.createButtonText}>+ Create Duel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={duels}
                renderItem={renderDuelCard}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListFooterComponent={
                  <TouchableOpacity style={styles.createButton} onPress={handleCreateDuel}>
                    <Text style={styles.createButtonText}>+ Create New Duel</Text>
                  </TouchableOpacity>
                }
              />
            )}
          </>
        ) : (
          <FlatList
            data={history}
            renderItem={renderHistoryCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Footer stats */}
        <View style={styles.footer}>
          <View style={styles.footerStat}>
            <Text style={styles.footerLabel}>Your Record</Text>
            <Text style={styles.footerValue}>{wins}-{losses}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.footerStat}>
            <Text style={styles.footerLabel}>Total Earnings</Text>
            <Text style={[styles.footerValue, { color: totalEarnings >= 0 ? "#00ff00" : "#ff4444" }]}>
              {totalEarnings >= 0 ? "+" : ""}{totalEarnings} SKR
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { fontSize: 28, fontWeight: "bold", color: "#00ff00" },
  liveIndicator: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  subtitle: { fontSize: 13, color: "#aaa" },
  tabContainer: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 15, gap: 10, marginTop: 10 },
  tab: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)", alignItems: "center",
  },
  activeTab: { backgroundColor: "rgba(0,255,0,0.15)", borderColor: "#00ff00" },
  tabText: { color: "#999", fontWeight: "500", fontSize: 11 },
  activeTabText: { color: "#00ff00" },
  listContent: { paddingHorizontal: 20, paddingBottom: 10 },
  duelCard: {
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: "rgba(0,255,0,0.2)",
  },
  duelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 15 },
  challengerName: { fontSize: 16, fontWeight: "600", color: "#fff", marginBottom: 4 },
  winRecord: { fontSize: 12, color: "#888" },
  difficultyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  difficultyText: { fontSize: 11, fontWeight: "600" },
  nftShowcase: { marginBottom: 15 },
  nftTitle: { fontSize: 12, color: "#666", marginBottom: 8 },
  nftCard: {
    backgroundColor: "rgba(0,255,0,0.1)", borderRadius: 8, padding: 15,
    alignItems: "center", borderWidth: 1, borderColor: "rgba(0,255,0,0.2)",
  },
  nftPlaceholder: { fontSize: 40, marginBottom: 8 },
  nftStats: { fontSize: 12, color: "#00ff00", fontWeight: "600" },
  acceptButton: { backgroundColor: "#ff4444", paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  pendingButton: { backgroundColor: "rgba(255,68,68,0.4)" },
  acceptButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  historyCard: {
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 14,
    marginBottom: 10, flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", borderLeftWidth: 3,
  },
  historyLeft: { flex: 1 },
  opponentName: { fontSize: 14, fontWeight: "600", color: "#fff", marginBottom: 4 },
  historyDate: { fontSize: 11, color: "#666" },
  historyRight: { alignItems: "flex-end" },
  resultText: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  rewardText: { fontSize: 12, fontWeight: "600" },
  footer: {
    paddingHorizontal: 20, paddingVertical: 15, borderTopWidth: 1,
    borderTopColor: "rgba(0,255,0,0.1)", flexDirection: "row",
    justifyContent: "space-around", alignItems: "center",
  },
  footerStat: { alignItems: "center" },
  footerLabel: { fontSize: 11, color: "#666", marginBottom: 4 },
  footerValue: { fontSize: 16, fontWeight: "bold", color: "#00ff00" },
  divider: { width: 1, height: 30, backgroundColor: "rgba(0,255,0,0.1)" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyIcon: { fontSize: 60, marginBottom: 16 },
  emptyText: { color: "#666", fontSize: 14, marginBottom: 20 },
  createButton: {
    backgroundColor: "rgba(0,255,0,0.1)", borderWidth: 1, borderColor: "#00ff00",
    paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, alignItems: "center",
    marginTop: 10, marginHorizontal: 20, marginBottom: 8,
  },
  createButtonText: { color: "#00ff00", fontWeight: "600", fontSize: 13 },
});

export default PvPArenaScreen;
