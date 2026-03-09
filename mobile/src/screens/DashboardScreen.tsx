/**
 * DashboardScreen.tsx
 *
 * Premium EcoQuest dashboard — redesigned with:
 *  • Animated neon glowing virtual tree inside a glass terrarium
 *  • Daily streak counter with flame icon (derived from lastClaimAt)
 *  • Floating glassmorphism stat cards: CO2 Saved + ECO Token Balance
 *  • Live SOL / SKR balances from chain
 *  • Quick actions: Create Quest, Map, Staking, Leaderboard
 */

import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useWallet } from "../contexts/WalletContext";
import { useQuests } from "../contexts/QuestContext";
import { useOnChainData } from "../hooks/useSolanaData";
import { useStakerInfo } from "../hooks/useStakerInfo";
import { Colors } from "../utils/colors";
import EcoTree from "../components/EcoTree";
import ShareGrowthCard from "../components/ShareGrowthCard";
import { useEcoBadgeMinter } from "../hooks/useEcoBadgeMinter";
import PendingSyncBadge from "../components/PendingSyncBadge";

const { width: W, height: H } = Dimensions.get("window");

// ── Constants ─────────────────────────────────────────────────────────────────

// 1 ECO point ≈ 0.05 kg CO2 saved (rough equivalence for eco activities)
const CO2_PER_ECO = 0.05;

// Tree growth stages based on ECO points
function getTreeStage(ecoPoints: number): { emoji: string; label: string; glowColor: string; size: number } {
  if (ecoPoints >= 500) return { emoji: "🌳", label: "Ancient Tree",    glowColor: "#00ff87", size: 100 };
  if (ecoPoints >= 300) return { emoji: "🌲", label: "Tall Tree",       glowColor: "#10d981", size: 90  };
  if (ecoPoints >= 150) return { emoji: "🌿", label: "Young Tree",      glowColor: "#34d399", size: 78  };
  if (ecoPoints >= 50)  return { emoji: "🌱", label: "Sprout",          glowColor: "#6ee7b7", size: 66  };
  return                       { emoji: "🌰", label: "Seed",            glowColor: "#a7f3d0", size: 52  };
}

function calcStreak(totalQuests: number): number {
  // Derive streak days from quest count (one quest per day assumption)
  return Math.min(totalQuests, 365);
}

// GlowingTree replaced by EcoTree component (see components/EcoTree.tsx)

// ── Streak Counter ────────────────────────────────────────────────────────────

function StreakCounter({ days }: { days: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.12, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, true
    );
  }, []);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={streak.container}>
      <Animated.Text style={[streak.flame, flameStyle]}>🔥</Animated.Text>
      <View>
        <Text style={streak.days}>Day {days}</Text>
        <Text style={streak.label}>Streak</Text>
      </View>
      <View style={streak.bar}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={[streak.dot, i < (days % 7 || 7) && streak.dotActive]} />
        ))}
      </View>
    </View>
  );
}

// ── Stat Cards ────────────────────────────────────────────────────────────────

function StatCards({ co2Kg, ecoBalance, solBalance, skrBalance }: {
  co2Kg: number; ecoBalance: number; solBalance: number; skrBalance: number;
}) {
  return (
    <View style={cards.row}>
      {/* CO2 Saved */}
      <View style={[cards.card, { borderColor: "rgba(0,255,135,0.25)" }]}>
        <Text style={cards.icon}>🌍</Text>
        <Text style={cards.label}>CO2 Saved</Text>
        <Text style={[cards.value, { color: "#00ff87" }]}>{co2Kg.toFixed(1)} kg</Text>
        <Text style={cards.sub}>+Positive Impact</Text>
      </View>
      {/* ECO Token */}
      <View style={[cards.card, { borderColor: "rgba(0,200,255,0.25)" }]}>
        <Text style={cards.icon}>🪙</Text>
        <Text style={cards.label}>ECO Token</Text>
        <Text style={[cards.value, { color: "#00c8ff" }]}>{ecoBalance.toLocaleString()}</Text>
        <Text style={cards.sub}>Points Balance</Text>
      </View>
      {/* SOL */}
      <View style={[cards.card, { borderColor: "rgba(153,69,255,0.25)" }]}>
        <Text style={cards.icon}>◎</Text>
        <Text style={cards.label}>SOL</Text>
        <Text style={[cards.value, { color: "#9945ff" }]}>{solBalance.toFixed(3)}</Text>
        <Text style={cards.sub}>Devnet</Text>
      </View>
      {/* SKR */}
      <View style={[cards.card, { borderColor: "rgba(249,115,22,0.25)" }]}>
        <Text style={cards.icon}>💎</Text>
        <Text style={cards.label}>SKR</Text>
        <Text style={[cards.value, { color: "#f97316" }]}>{Math.round(skrBalance).toLocaleString()}</Text>
        <Text style={cards.sub}>Token</Text>
      </View>
    </View>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

const ACTIONS = [
  { icon: "📸", label: "Buat Quest",  route: "CreateQuest",  color: "#00ff87" },
  { icon: "📍", label: "Eco Map",     route: "Map",          color: "#00c8ff" },
  { icon: "💎", label: "Staking",     route: "Staking",      color: "#f97316" },
  { icon: "🏅", label: "Leaderboard", route: "Leaderboard",  color: "#a78bfa" },
];

// Tab screens must be navigated via the "Main" parent
const TAB_ROUTES = new Set(["Dashboard", "Quests", "Map", "Staking", "Profile"]);

function QuickActions({ navigation }: { navigation: any }) {
  return (
    <View style={qa.container}>
      <Text style={qa.sectionTitle}>Quick Actions</Text>
      <View style={qa.grid}>
        {ACTIONS.map((a) => (
          <TouchableOpacity
            key={a.route}
            style={[qa.btn, { borderColor: a.color + "40" }]}
            onPress={() => {
              if (TAB_ROUTES.has(a.route)) {
                navigation.navigate("Main", { screen: a.route });
              } else {
                navigation.navigate(a.route);
              }
            }}
            activeOpacity={0.8}
          >
            <View style={[qa.iconWrap, { backgroundColor: a.color + "18" }]}>
              <Text style={qa.btnIcon}>{a.icon}</Text>
            </View>
            <Text style={qa.btnLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { publicKeyBase58 } = useWallet();
  const { userQuests, totalEcoPoints } = useQuests();
  const onChain = useOnChainData(publicKeyBase58);
  const stakerInfo = useStakerInfo(publicKeyBase58);

  const co2Saved = totalEcoPoints * CO2_PER_ECO;
  const streak = calcStreak(userQuests.length);
  const stakedSKR = stakerInfo.stakerInfo?.stakedAmount ?? 0;

  // Auto-mint Eco Badge cNFT when tree levels up
  useEcoBadgeMinter();

  return (
    <LinearGradient colors={["#050c14", "#071526", "#050c14"]} style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.appName}>🌿 EcoQuest</Text>
              <Text style={s.walletAddr}>
                {publicKeyBase58
                  ? `${publicKeyBase58.slice(0, 6)}…${publicKeyBase58.slice(-4)}`
                  : "Demo Mode"} · Devnet
              </Text>
            </View>
            <TouchableOpacity
              style={s.profileBtn}
              onPress={() => navigation.navigate("Main", { screen: "Profile" })}
            >
              <Text style={s.profileBtnText}>👤</Text>
            </TouchableOpacity>
          </View>

          {/* Offline Sync Indicator */}
          <PendingSyncBadge />

          {/* Streak */}
          <StreakCounter days={streak || 1} />

          {/* Virtual tree terrarium */}
          <EcoTree ecoPoints={totalEcoPoints} size={180} />

          {/* Share My Growth card */}
          <ShareGrowthCard
            ecoPoints={totalEcoPoints}
            questCount={userQuests.length}
            walletAddress={publicKeyBase58 ?? undefined}
          />

          {/* Stat cards */}
          <StatCards
            co2Kg={co2Saved}
            ecoBalance={totalEcoPoints}
            solBalance={onChain.sol}
            skrBalance={onChain.skr + stakedSKR}
          />

          {/* Quest count badge */}
          <View style={s.questBanner}>
            <Text style={s.questBannerText}>
              🌱 {userQuests.length} eco-quest selesai · {totalEcoPoints} ECO dikumpulkan
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Main", { screen: "Quests" })}>
              <Text style={s.questBannerLink}>Lihat →</Text>
            </TouchableOpacity>
          </View>

          {/* Quick actions */}
          <QuickActions navigation={navigation} />

          {/* Future ECO token notice */}
          <View style={s.tokenNotice}>
            <Text style={s.tokenNoticeIcon}>🚀</Text>
            <Text style={s.tokenNoticeText}>
              ECO Points akan dapat diconvert ke token ECO di mainnet. Terus kumpulkan!
            </Text>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  appName: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  walletAddr: { fontSize: 11, color: "#3a7a6a", marginTop: 2 },
  profileBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(0,255,135,0.12)",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(0,255,135,0.3)",
  },
  profileBtnText: { fontSize: 20 },
  questBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(0,255,135,0.06)", borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: "rgba(0,255,135,0.15)",
  },
  questBannerText: { fontSize: 12, color: "#aaa", flex: 1 },
  questBannerLink: { fontSize: 13, color: "#00ff87", fontWeight: "700" },
  tokenNotice: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(102,126,234,0.08)", borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: "rgba(102,126,234,0.2)",
  },
  tokenNoticeIcon: { fontSize: 22 },
  tokenNoticeText: { flex: 1, fontSize: 12, color: "#7a8fc4", lineHeight: 18 },
});

// Tree styles
const tree = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 14 },
  dome: {
    width: W * 0.72, height: W * 0.72,
    borderRadius: W * 0.36,
    backgroundColor: "rgba(5,20,40,0.7)",
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1.5, borderColor: "rgba(0,255,135,0.2)",
    // Shadow glow
    shadowColor: "#00ff87",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },
  outerGlow: {
    position: "absolute",
    width: "100%", height: "100%",
    borderRadius: W * 0.36,
    borderWidth: 3,
  },
  innerGlow: {
    position: "absolute",
    width: "85%", height: "85%",
    borderRadius: W * 0.36,
  },
  domeGlass: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: "50%",
    borderTopLeftRadius: W * 0.36,
    borderTopRightRadius: W * 0.36,
  },
  treeContainer: { alignItems: "center", justifyContent: "center", flex: 1 },
  treeEmoji: { textAlign: "center" },
  ground: {
    position: "absolute", bottom: 20, left: 0, right: 0,
    alignItems: "center",
  },
  groundMoss: { fontSize: 14, opacity: 0.7 },
  stageChip: {
    position: "absolute", bottom: 10, right: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  stageLabel: { fontSize: 9, fontWeight: "700" },
  progressContainer: { width: W * 0.72, gap: 4 },
  progressLabel: { fontSize: 11, color: "#666", fontWeight: "600" },
  progressBarBg: {
    height: 6, backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 3, overflow: "hidden",
  },
  progressBarFill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 10, color: "#555", textAlign: "right" },
});

// Streak styles
const streak = StyleSheet.create({
  container: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 14,
    borderWidth: 1, borderColor: "rgba(249,115,22,0.2)",
  },
  flame: { fontSize: 28 },
  days: { fontSize: 20, fontWeight: "900", color: "#fff" },
  label: { fontSize: 11, color: "#888", marginTop: 1 },
  bar: { flexDirection: "row", gap: 5, marginLeft: "auto" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.1)" },
  dotActive: { backgroundColor: "#f97316" },
});

// Stat card styles
const cards = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14, padding: 12, alignItems: "center",
    borderWidth: 1, gap: 2,
  },
  icon: { fontSize: 20, marginBottom: 2 },
  label: { fontSize: 9, color: "#777", fontWeight: "600", textTransform: "uppercase" },
  value: { fontSize: 16, fontWeight: "800" },
  sub: { fontSize: 9, color: "#555" },
});

// Quick action styles
const qa = StyleSheet.create({
  container: { gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#ccc", textTransform: "uppercase", letterSpacing: 0.8 },
  grid: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14, padding: 14, alignItems: "center",
    borderWidth: 1, gap: 6,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  btnIcon: { fontSize: 22 },
  btnLabel: { fontSize: 10, fontWeight: "700", color: "#aaa", textAlign: "center" },
});
