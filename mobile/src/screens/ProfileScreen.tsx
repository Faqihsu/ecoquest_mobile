/**
 * ProfileScreen.tsx
 * User profile with real on-chain data + editable username/avatar:
 *   - SOL/SKR balances from useOnChainData
 *   - Staked SKR from useStakerInfo (stakerPDA)
 *   - NFTs live from Helius DAS
 *   - XP/level derived from nftCount + staked amount
 *   - Badges derived from real on-chain achievements
 *   - Username & avatar stored in AsyncStorage via useProfile
 *   - Avatar: pick from gallery using expo-image-picker
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../utils/colors";
import { useWallet } from "../contexts/WalletContext";
import { useOnChainData } from "../hooks/useSolanaData";
import { useStakerInfo } from "../hooks/useStakerInfo";
import { useProfile } from "../hooks/useProfile";
import { LoadingShimmer, NFTGridShimmer, EmptyState } from "../components/DataStateView";

// ── Level config ──────────────────────────────────────────────────────────────

const LEVEL_THRESHOLDS = [0, 500, 1200, 2500, 5000, 10000];
const LEVEL_TITLES = ["Seedling", "Sprout", "Sapling", "Guardian", "Elder", "Legend"];

function getLevelInfo(xp: number) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
  }
  const cur = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level] ?? cur;
  return {
    level,
    title: LEVEL_TITLES[level - 1] ?? "Legend",
    nextThreshold: next,
    progress: next === cur ? 1 : (xp - cur) / (next - cur),
  };
}

function deriveBadges(nftCount: number, stakedSKR: number) {
  return [
    { id: "b1", name: "First Quest",      icon: "🌱", rarity: "common",    earned: nftCount >= 1 },
    { id: "b2", name: "Quest Explorer",   icon: "🗺️", rarity: "rare",      earned: nftCount >= 5 },
    { id: "b3", name: "Eco Champion",     icon: "🏆", rarity: "epic",      earned: nftCount >= 10 },
    { id: "b4", name: "Staking Guardian", icon: "🔒", rarity: "rare",      earned: stakedSKR >= 1000 },
    { id: "b5", name: "Mega Staker",      icon: "💎", rarity: "legendary", earned: stakedSKR >= 10000 },
    { id: "b6", name: "Beach Cleaner",    icon: "🏖️", rarity: "common",    earned: nftCount >= 2 },
    { id: "b7", name: "Tree Planter",     icon: "🌳", rarity: "common",    earned: nftCount >= 3 },
  ].filter((b) => b.earned);
}

const rarityColor: Record<string, string> = {
  common: "#888", rare: "#10d981", epic: "#667eea", legendary: "#ffaa00",
};

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({
  visible,
  currentUsername,
  currentAvatar,
  onSave,
  onClose,
}: {
  visible: boolean;
  currentUsername: string;
  currentAvatar: string | null;
  onSave: (name: string, avatar: string | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(currentUsername);
  const [avatar, setAvatar] = useState<string | null>(currentAvatar);
  const [picking, setPicking] = useState(false);

  const handlePickImage = async () => {
    setPicking(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Izin Diperlukan", "Izinkan akses galeri untuk memilih foto profil.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setAvatar(result.assets[0].uri);
      }
    } finally {
      setPicking(false);
    }
  };

  const handleCamera = async () => {
    setPicking(true);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Izin Diperlukan", "Izinkan akses kamera untuk foto profil.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setAvatar(result.assets[0].uri);
      }
    } finally {
      setPicking(false);
    }
  };

  const handleAvatarPress = () => {
    Alert.alert("Ganti Foto Profil", "Pilih sumber foto:", [
      { text: "Galeri", onPress: handlePickImage },
      { text: "Kamera", onPress: handleCamera },
      { text: "Hapus Foto", style: "destructive", onPress: () => setAvatar(null) },
      { text: "Batal", style: "cancel" },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={modalStyles.sheet}>
            {/* Handle bar */}
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>✏️ Edit Profil</Text>

            {/* Avatar picker */}
            <View style={modalStyles.avatarSection}>
              <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={modalStyles.avatarPrev} />
                ) : (
                  <View style={modalStyles.avatarPlaceholder}>
                    <Text style={{ fontSize: 40 }}>👤</Text>
                  </View>
                )}
                <View style={modalStyles.cameraBadge}>
                  {picking
                    ? <ActivityIndicator size="small" color="#000" />
                    : <Ionicons name="camera" size={16} color="#000" />}
                </View>
              </TouchableOpacity>
              <Text style={modalStyles.avatarHint}>Ketuk untuk ganti foto</Text>
            </View>

            {/* Username input */}
            <Text style={modalStyles.inputLabel}>Nama Tampilan</Text>
            <TextInput
              style={modalStyles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Masukkan nama (maks. 20 karakter)"
              placeholderTextColor="#555"
              maxLength={20}
              autoCapitalize="words"
              returnKeyType="done"
            />
            <Text style={modalStyles.charCount}>{draft.length}/20</Text>

            {/* Actions */}
            <View style={modalStyles.actions}>
              <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
                <Text style={modalStyles.cancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={modalStyles.saveBtn}
                onPress={() => onSave(draft, avatar)}
              >
                <Text style={modalStyles.saveText}>💾 Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen({ navigation }: any) {
  const { connected, publicKeyBase58, disconnect } = useWallet();
  const onChain = useOnChainData(publicKeyBase58);
  const stakerInfo = useStakerInfo(publicKeyBase58);
  const { profile, displayName, updateUsername, updateAvatar, isLoading: profileLoading } = useProfile(publicKeyBase58);
  const [activeTab, setActiveTab] = useState<"stats" | "nfts" | "badges">("stats");
  const [editVisible, setEditVisible] = useState(false);

  const stakedSKR = stakerInfo.stakerInfo?.stakedAmount ?? 0;
  const xp = onChain.nftCount * 250 + Math.floor(stakedSKR);
  const { level, title, progress, nextThreshold } = getLevelInfo(xp);
  const badges = deriveBadges(onChain.nftCount, stakedSKR);
  const name = displayName(publicKeyBase58);

  const handleSaveProfile = async (username: string, avatar: string | null) => {
    await updateUsername(username);
    await updateAvatar(avatar);
    setEditVisible(false);
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Putus koneksi wallet?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Logout", style: "destructive",
        onPress: async () => {
          await disconnect();
          navigation.reset({ index: 0, routes: [{ name: "WalletConnect" }] });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>

          {/* Header */}
          <View style={styles.headerSection}>
            {/* Tappable avatar */}
            <TouchableOpacity onPress={() => setEditVisible(true)} activeOpacity={0.8} style={styles.avatarWrapper}>
              {profile.avatarUri ? (
                <Image source={{ uri: profile.avatarUri }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatar}>👤</Text>
                </View>
              )}
              {/* Edit badge */}
              <View style={styles.editBadge}>
                <Ionicons name="pencil" size={12} color="#000" />
              </View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.username} numberOfLines={1}>{name}</Text>
                <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.editNameBtn}>
                  <Ionicons name="pencil-outline" size={16} color="#10d981" />
                </TouchableOpacity>
              </View>
              <Text style={styles.walletAddress}>
                {publicKeyBase58
                  ? `${publicKeyBase58.slice(0, 8)}...${publicKeyBase58.slice(-4)}`
                  : "Demo Mode"} · Devnet
              </Text>
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Lv.{level} · {title}</Text>
              </View>
            </View>
          </View>

          {/* XP Progress */}
          <View style={styles.xpSection}>
            <View style={styles.xpRow}>
              <Text style={styles.xpLabel}>XP Progress</Text>
              <Text style={styles.xpValue}>{xp.toLocaleString()} / {nextThreshold.toLocaleString()} XP</Text>
            </View>
            <View style={styles.xpBarBg}>
              <View style={[styles.xpBarFill, { width: `${Math.min(Math.round(progress * 100), 100)}%` }]} />
            </View>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🎮</Text>
              <Text style={styles.statValue}>{xp.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total XP</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>✅</Text>
              <Text style={styles.statValue}>{onChain.nftCount}</Text>
              <Text style={styles.statLabel}>Quest Done</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🎨</Text>
              {onChain.nftsLoading
                ? <LoadingShimmer width={40} height={18} borderRadius={4} />
                : <Text style={styles.statValue}>{onChain.nftCount}</Text>}
              <Text style={styles.statLabel}>NFTs</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🔒</Text>
              {stakerInfo.isLoading
                ? <LoadingShimmer width={40} height={18} borderRadius={4} />
                : <Text style={styles.statValue}>{Math.floor(stakedSKR).toLocaleString()}</Text>}
              <Text style={styles.statLabel}>Staked SKR</Text>
            </View>
          </View>

          {/* Wealth: SOL + SKR */}
          <View style={styles.wealthSection}>
            <View style={styles.wealthCard}>
              <Text style={styles.wealthLabel}>SOL Balance</Text>
              {onChain.solLoading
                ? <LoadingShimmer width={80} height={22} borderRadius={4} />
                : <Text style={styles.wealthAmount}>{onChain.sol.toFixed(4)}</Text>}
              <Text style={styles.wealthSubtext}>Native</Text>
            </View>
            <View style={styles.wealthCard}>
              <Text style={styles.wealthLabel}>SKR Token</Text>
              {onChain.skrLoading
                ? <LoadingShimmer width={80} height={22} borderRadius={4} />
                : <Text style={styles.wealthAmount}>{onChain.skr.toLocaleString()}</Text>}
              <Text style={styles.wealthSubtext}>SPL Token</Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabContainer}>
            {(["stats", "nfts", "badges"] as const).map((tab) => (
              <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                  {tab === "stats" ? "📊 Stats" : tab === "nfts" ? "🎨 NFTs" : "🏆 Badges"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Stats Tab */}
          {activeTab === "stats" && (
            <View style={styles.tabContent}>
              {[
                { label: "Nama Tampilan",    value: name },
                { label: "Level",            value: `${level} — ${title}` },
                { label: "Quest Selesai",    value: `${onChain.nftCount} quest` },
                { label: "NFT Proof Minted", value: `${onChain.nftCount} NFT` },
                { label: "SKR Staked",       value: `${Math.floor(stakedSKR).toLocaleString()} SKR` },
                { label: "Network",          value: "Solana Devnet" },
              ].map((row) => (
                <View key={row.label} style={styles.statRow}>
                  <Text style={styles.statRowLabel}>{row.label}</Text>
                  <Text style={styles.statRowValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* NFTs Tab */}
          {activeTab === "nfts" && (
            <View style={styles.tabContent}>
              {onChain.nftsLoading ? (
                <NFTGridShimmer count={6} />
              ) : onChain.nftCount === 0 ? (
                <EmptyState icon="🎨" title="Belum Ada NFT" message="Selesaikan quest untuk mendapatkan NFT proof-of-activity!" />
              ) : (
                <View style={styles.nftGrid}>
                  {onChain.nfts.slice(0, 9).map((nft) => (
                    <View key={nft.id} style={styles.nftCard}>
                      {nft.image
                        ? <Image source={{ uri: nft.image }} style={styles.nftImageReal} resizeMode="cover" />
                        : <Text style={styles.nftImage}>🌿</Text>}
                      <Text style={styles.nftName} numberOfLines={1}>{nft.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Badges Tab */}
          {activeTab === "badges" && (
            <View style={styles.tabContent}>
              {badges.length === 0 ? (
                <EmptyState icon="🏅" title="Belum Ada Badge" message="Selesaikan quest pertama untuk dapat badge!" />
              ) : (
                <View style={styles.badgeGrid}>
                  {badges.map((badge) => (
                    <View key={badge.id} style={styles.badgeCard}>
                      <Text style={styles.badgeIcon}>{badge.icon}</Text>
                      <Text style={styles.badgeName}>{badge.name}</Text>
                      <Text style={[styles.badgeRarity, { color: rarityColor[badge.rarity] ?? "#aaa" }]}>
                        {badge.rarity.toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton} onPress={() => setEditVisible(true)}>
              <Text style={styles.actionButtonText}>✏️ Edit Profil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate("Leaderboard")}>
              <Text style={styles.actionButtonText}>🏅 Leaderboard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate("Settings")}>
              <Text style={styles.actionButtonText}>⚙️ Settings</Text>
            </TouchableOpacity>
            {/* More features */}
            <View style={styles.moreRow}>
              <TouchableOpacity style={styles.moreBtn} onPress={() => navigation.navigate("PvP")}>
                <Text style={styles.moreBtnIcon}>⚔️</Text>
                <Text style={styles.moreBtnText}>PvP Arena</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreBtn} onPress={() => navigation.navigate("Governance")}>
                <Text style={styles.moreBtnIcon}>🏛️</Text>
                <Text style={styles.moreBtnText}>Governance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreBtn} onPress={() => navigation.navigate("GuardianPool")}>
                <Text style={styles.moreBtnIcon}>🛡️</Text>
                <Text style={styles.moreBtnText}>Guardian</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreBtn} onPress={() => navigation.navigate("Swap")}>
                <Text style={styles.moreBtnIcon}>🔄</Text>
                <Text style={styles.moreBtnText}>Swap</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>🚪 Logout</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={editVisible}
        currentUsername={profile.username}
        currentAvatar={profile.avatarUri}
        onSave={handleSaveProfile}
        onClose={() => setEditVisible(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.dark },
  content: { paddingHorizontal: 20, paddingVertical: 20 },

  // Header
  headerSection: { flexDirection: "row", alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,255,0,0.1)" },
  avatarWrapper: { position: "relative", marginRight: 14 },
  avatarContainer: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(0,255,0,0.15)", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#00ff00" },
  avatarImg: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: "#00ff00" },
  avatar: { fontSize: 36 },
  editBadge: { position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: "#10d981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: Colors.background.dark },
  profileInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  username: { fontSize: 18, fontWeight: "bold", color: "#fff", flex: 1 },
  editNameBtn: { padding: 4 },
  walletAddress: { fontSize: 11, color: "#666", marginBottom: 7 },
  levelBadge: { backgroundColor: "rgba(0,255,0,0.2)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start" },
  levelText: { color: "#00ff00", fontSize: 11, fontWeight: "600" },

  // XP
  xpSection: { marginBottom: 20 },
  xpRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  xpLabel: { fontSize: 11, color: "#999", fontWeight: "600" },
  xpValue: { fontSize: 11, color: "#00ff00", fontWeight: "600" },
  xpBarBg: { height: 7, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" },
  xpBarFill: { height: "100%", backgroundColor: "#00ff00", borderRadius: 4 },

  // Stats grid
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 20, gap: 10 },
  statCard: { width: "48%", backgroundColor: "rgba(0,255,0,0.05)", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,255,0,0.2)" },
  statIcon: { fontSize: 28, marginBottom: 6 },
  statValue: { fontSize: 16, fontWeight: "bold", color: "#00ff00", marginBottom: 3 },
  statLabel: { fontSize: 10, color: "#666", textAlign: "center" },

  // Wealth
  wealthSection: { flexDirection: "row", gap: 10, marginBottom: 20 },
  wealthCard: { flex: 1, backgroundColor: "rgba(102,126,234,0.1)", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "rgba(102,126,234,0.3)" },
  wealthLabel: { fontSize: 11, color: "#999", marginBottom: 5 },
  wealthAmount: { fontSize: 17, fontWeight: "bold", color: "#667eea", marginBottom: 3 },
  wealthSubtext: { fontSize: 10, color: "#666" },

  // Tabs
  tabContainer: { flexDirection: "row", gap: 8, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center" },
  activeTab: { backgroundColor: "rgba(0,255,0,0.15)", borderColor: "#00ff00" },
  tabText: { color: "#999", fontWeight: "500", fontSize: 11 },
  activeTabText: { color: "#00ff00" },
  tabContent: { marginBottom: 22 },

  // Stats rows
  statRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(0,255,0,0.08)" },
  statRowLabel: { fontSize: 13, color: "#ccc" },
  statRowValue: { fontSize: 13, fontWeight: "600", color: "#00ff00" },

  // NFT grid
  nftGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  nftCard: { width: "31%", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,255,0,0.2)" },
  nftImage: { fontSize: 28, marginBottom: 6 },
  nftImageReal: { width: 48, height: 48, borderRadius: 8, marginBottom: 6, backgroundColor: "rgba(255,255,255,0.05)" },
  nftName: { fontSize: 10, color: "#aaa", textAlign: "center" },

  // Badges
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgeCard: { width: "48%", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  badgeIcon: { fontSize: 28, marginBottom: 6 },
  badgeName: { fontSize: 11, fontWeight: "600", color: "#fff", textAlign: "center", marginBottom: 3 },
  badgeRarity: { fontSize: 9, fontWeight: "600" },

  // Action buttons
  actionButtons: { gap: 10, marginTop: 8 },
  actionButton: { backgroundColor: "rgba(0,255,0,0.1)", paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,255,0,0.3)" },
  actionButtonText: { color: "#00ff00", fontWeight: "600", fontSize: 13 },
  logoutButton: { backgroundColor: "rgba(255,68,68,0.1)", borderColor: "#ff4444" },
  logoutButtonText: { color: "#ff4444", fontWeight: "600", fontSize: 13 },

  // More features row
  moreRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  moreBtn: { flex: 1, minWidth: "45%", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  moreBtnIcon: { fontSize: 16 },
  moreBtnText: { fontSize: 12, color: "#aaa", fontWeight: "600" },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0f1419", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "800", color: "#fff", marginBottom: 20, textAlign: "center" },

  avatarSection: { alignItems: "center", marginBottom: 24 },
  avatarPrev: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: "#10d981" },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: "rgba(0,255,0,0.15)", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#10d981" },
  cameraBadge: { position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: "#10d981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#0f1419" },
  avatarHint: { color: "#666", fontSize: 11, marginTop: 8 },

  inputLabel: { color: "#aaa", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, color: "#fff", fontSize: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", marginBottom: 4 },
  charCount: { color: "#555", fontSize: 11, textAlign: "right", marginBottom: 20 },

  actions: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center" },
  cancelText: { color: "#aaa", fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: "#10d981", alignItems: "center" },
  saveText: { color: "#000", fontWeight: "800", fontSize: 15 },
});
