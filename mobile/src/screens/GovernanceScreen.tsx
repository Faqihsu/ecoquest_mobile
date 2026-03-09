import { Colors } from "../utils/colors";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";

import { useWallet } from "../contexts/WalletContext";
import { useMWASign } from "../hooks/useMWASign";
import {
  fetchProposals,
  fetchProposalHistory,
  castVote,
  Proposal,
} from "../services/GovernanceService";

const GovernanceScreen = ({ navigation }: any) => {
  const { connected, publicKey, publicKeyBase58 } = useWallet();
  const { signTransaction } = useMWASign();
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [history, setHistory] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  // ── Fetch data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [activeData, histData] = await Promise.all([
        fetchProposals(),
        fetchProposalHistory(),
      ]);
      setProposals(activeData);
      setHistory(histData);
    } catch {
      Alert.alert("Error", "Failed to load proposals from chain");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Vote handler ────────────────────────────────────────────────────────────

  const handleVote = useCallback(
    (proposal: Proposal, direction: boolean) => {
      const proposalId = proposal.id;
      if (!connected) {
        Alert.alert("Not Connected", "Please connect your wallet to vote");
        return;
      }
      if (votedIds.has(proposalId)) {
        Alert.alert("Already Voted", "You have already voted on this proposal");
        return;
      }

      Alert.alert(
        `Vote ${direction ? "👍 YES" : "👎 NO"}`,
        direction
          ? "Submit YES vote on-chain?"
          : "Submit NO vote on-chain?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm & Sign",
            onPress: async () => {
              setVotingId(proposalId);
              try {
                if (publicKey) {
                  await castVote(
                    proposalId,
                    proposal.proposalIndex,
                    direction,
                    publicKey,
                    signTransaction
                  );
                }
                // Optimistically update vote counts
                setProposals((prev) =>
                  prev.map((p) =>
                    p.id === proposalId
                      ? {
                          ...p,
                          yesVotes: direction ? p.yesVotes + 1 : p.yesVotes,
                          noVotes: !direction ? p.noVotes + 1 : p.noVotes,
                        }
                      : p
                  )
                );
                setVotedIds((prev) => new Set(prev).add(proposalId));
                Alert.alert(
                  "✅ Vote Recorded!",
                  `Your ${direction ? "YES" : "NO"} vote is on-chain.`
                );
              } catch (err: any) {
                Alert.alert("Vote Failed", err?.message ?? "Transaction error");
              } finally {
                setVotingId(null);
              }
            },
          },
        ]
      );
    },
    [connected, publicKey, votedIds]
  );

  const calculateVotePercentage = (yes: number, no: number) => {
    const total = yes + no;
    if (total === 0) return 50;
    return (yes / total) * 100;
  };

  const formatTimeLeft = (endTimestamp: number) => {
    const diff = endTimestamp - Date.now();
    if (diff <= 0) return "Ended";
    const days = Math.floor(diff / 86400_000);
    const hours = Math.floor((diff % 86400_000) / 3600_000);
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  };

  // ── Render Proposal ─────────────────────────────────────────────────────────

  const renderProposalCard = ({ item }: { item: Proposal }) => {
    const pct = calculateVotePercentage(item.yesVotes, item.noVotes);
    const total = item.yesVotes + item.noVotes;
    const isVoting = votingId === item.id;
    const hasVoted = votedIds.has(item.id);

    return (
      <View style={styles.proposalCard}>
        <View style={styles.proposalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.proposalTitle}>{item.title}</Text>
            <Text style={styles.proposalTime}>{formatTimeLeft(item.endTimestamp)}</Text>
          </View>
          <View style={styles.rewardBadge}>
            <Text style={styles.rewardText}>+{item.rewardSKR} SKR</Text>
          </View>
        </View>

        <Text style={styles.proposalDesc}>{item.description}</Text>

        <View style={styles.voteSection}>
          <View style={styles.voteStats}>
            <View style={styles.voteStat}>
              <Text style={styles.voteCount}>{item.yesVotes.toLocaleString()}</Text>
              <Text style={styles.voteLabel}>Yes Votes</Text>
            </View>
            <View style={styles.voteStat}>
              <Text style={[styles.voteCount, { color: '#ff4444' }]}>{item.noVotes.toLocaleString()}</Text>
              <Text style={styles.voteLabel}>No Votes</Text>
            </View>
            <View style={styles.voteStat}>
              <Text style={styles.voteCount}>{total.toLocaleString()}</Text>
              <Text style={styles.voteLabel}>Total</Text>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressText}>{pct.toFixed(0)}% Yes</Text>
          </View>
        </View>

        {hasVoted ? (
          <View style={styles.votedBadge}>
            <Text style={styles.votedText}>✓ You voted</Text>
          </View>
        ) : (
          <View style={styles.voteButtons}>
            <TouchableOpacity
              style={[styles.voteButton, styles.yesButton, isVoting && styles.buttonDisabled]}
              onPress={() => handleVote(item, true)}
              disabled={isVoting}
            >
              {isVoting ? <ActivityIndicator color="#00ff00" size="small" />
                : <Text style={styles.voteButtonText}>👍 Yes</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.voteButton, styles.noButton, isVoting && styles.buttonDisabled]}
              onPress={() => handleVote(item, false)}
              disabled={isVoting}
            >
              {isVoting ? <ActivityIndicator color="#ff4444" size="small" />
                : <Text style={styles.voteButtonText}>👎 No</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ── Render History ──────────────────────────────────────────────────────────

  const renderHistoryCard = ({ item }: { item: Proposal }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.historyTitle}>{item.title}</Text>
          <Text style={styles.historyDate}>
            {new Date(item.endTimestamp).toLocaleDateString('id-ID')}
          </Text>
        </View>
        <View style={[
          styles.resultBadge,
          { backgroundColor: item.status === 'passed' ? 'rgba(0,255,0,0.15)' : 'rgba(255,68,68,0.15)' },
        ]}>
          <Text style={[styles.resultText, { color: item.status === 'passed' ? '#00ff00' : '#ff4444' }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.historyStats}>
        <Text style={styles.historyStat}>
          ✓ {item.yesVotes.toLocaleString()} Yes  •  ✕ {item.noVotes.toLocaleString()} No
        </Text>
        {item.txSignature && (
          <Text style={styles.txSig}>TX: {item.txSignature.slice(0, 16)}...</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.background.dark }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.title}>🗳️ Governance</Text>
          <Text style={styles.subtitle}>Vote on new eco-quests and features • On-chain</Text>
        </View>

        <View style={styles.tabContainer}>
          {(["active", "history"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab === "active"
                  ? `Active Proposals (${proposals.length})`
                  : "History"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color="#00ff00" size="large" style={{ marginTop: 40 }} />
        ) : activeTab === "active" ? (
          <FlatList
            data={proposals}
            renderItem={renderProposalCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadData(true)}
                tintColor="#00ff00"
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No active proposals</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={history}
            renderItem={renderHistoryCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>💡 How Governance Works</Text>
          <Text style={styles.infoText}>🔷 Stake SKR to increase voting power</Text>
          <Text style={styles.infoText}>🗳️ Votes submitted as on-chain transactions</Text>
          <Text style={styles.infoText}>✅ Passed proposals executed automatically</Text>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: "bold", color: "#00ff00", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#aaa" },
  tabContainer: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 12, gap: 10 },
  tab: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center" },
  activeTab: { backgroundColor: "rgba(0,255,0,0.15)", borderColor: "#00ff00" },
  tabText: { color: "#999", fontWeight: "500", fontSize: 11 },
  activeTabText: { color: "#00ff00" },
  listContent: { paddingHorizontal: 20, paddingVertical: 8 },
  proposalCard: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "rgba(0,255,0,0.2)" },
  proposalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  proposalTitle: { fontSize: 15, fontWeight: "600", color: "#fff", flex: 1, marginBottom: 3 },
  proposalTime: { fontSize: 11, color: "#666" },
  rewardBadge: { backgroundColor: "rgba(0,255,0,0.15)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginLeft: 10 },
  rewardText: { color: "#00ff00", fontSize: 11, fontWeight: "600" },
  proposalDesc: { fontSize: 12, color: "#ccc", marginBottom: 12, lineHeight: 16 },
  voteSection: { marginBottom: 12 },
  voteStats: { flexDirection: "row", gap: 8, marginBottom: 10 },
  voteStat: { flex: 1, backgroundColor: "rgba(0,255,0,0.05)", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, alignItems: "center" },
  voteCount: { fontSize: 14, fontWeight: "bold", color: "#00ff00", marginBottom: 2 },
  voteLabel: { fontSize: 10, color: "#666" },
  progressContainer: { marginBottom: 6 },
  progressBar: { height: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden", marginBottom: 4 },
  progressFill: { height: "100%", backgroundColor: "#00ff00" },
  progressText: { fontSize: 11, color: "#00ff00", fontWeight: "600" },
  voteButtons: { flexDirection: "row", gap: 10 },
  voteButton: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 1 },
  yesButton: { backgroundColor: "rgba(0,255,0,0.1)", borderColor: "#00ff00" },
  noButton: { backgroundColor: "rgba(255,68,68,0.1)", borderColor: "#ff4444" },
  buttonDisabled: { opacity: 0.4 },
  voteButtonText: { fontWeight: "600", fontSize: 13, color: "#fff" },
  votedBadge: { backgroundColor: "rgba(0,255,0,0.08)", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  votedText: { color: "#00ff00", fontSize: 13, fontWeight: "600" },
  historyCard: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  historyTitle: { fontSize: 14, fontWeight: "600", color: "#fff", marginBottom: 3 },
  historyDate: { fontSize: 11, color: "#666" },
  resultBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginLeft: 10 },
  resultText: { fontSize: 11, fontWeight: "600" },
  historyStats: { paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  historyStat: { fontSize: 11, color: "#aaa" },
  txSig: { fontSize: 10, color: "#555", marginTop: 4, fontFamily: "monospace" },
  infoSection: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "rgba(0,255,0,0.04)", borderTopWidth: 1, borderTopColor: "rgba(0,255,0,0.1)" },
  infoTitle: { fontSize: 13, fontWeight: "600", color: "#00ff00", marginBottom: 8 },
  infoText: { fontSize: 11, color: "#aaa", marginBottom: 3 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { color: "#666", fontSize: 14 },
});

export default GovernanceScreen;
