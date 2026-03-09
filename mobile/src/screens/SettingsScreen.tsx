/**
 * SettingsScreen.tsx
 * Functional settings screen with:
 *   - Wallet info + copy address
 *   - Network info (Solana devnet)
 *   - App version
 *   - Disconnect wallet
 *   - Toggle demo mode info
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
  Clipboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../utils/colors";
import { useWallet } from "../contexts/WalletContext";
import { APP_VERSION, SOLANA_CLUSTER, ECOQUEST_PROGRAM_ID } from "../shared/config/constants";

// ── Row Components ─────────────────────────────────────────────────────────────

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger,
  rightIcon,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const color = danger ? "#ef4444" : Colors.text.primary;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <Ionicons name={icon} size={20} color={danger ? "#ef4444" : Colors.accent.primary} style={styles.rowIcon} />
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
        {value !== undefined && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
      </View>
      {rightIcon && <Ionicons name={rightIcon} size={16} color={Colors.text.muted} />}
      {onPress && !rightIcon && <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen({ navigation }: any) {
  const { connected, publicKeyBase58, walletName, isDemoMode, disconnect } = useWallet();

  const handleCopyAddress = () => {
    if (!publicKeyBase58) return;
    Clipboard.setString(publicKeyBase58);
    Alert.alert("✅ Disalin!", "Alamat wallet telah disalin ke clipboard.");
  };

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect Wallet",
      "Apakah Anda yakin ingin memutuskan koneksi wallet?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await disconnect();
            navigation.reset({ index: 0, routes: [{ name: "WalletConnect" }] });
          },
        },
      ]
    );
  };

  const programId = ECOQUEST_PROGRAM_ID.toBase58();

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>⚙️ Pengaturan</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>

          {/* Wallet */}
          <SectionHeader title="WALLET" />
          <View style={styles.card}>
            <SettingRow
              icon="wallet-outline"
              label="Status"
              value={isDemoMode ? "Demo Mode" : connected ? `Connected (${walletName ?? "Wallet"})` : "Disconnected"}
            />
            {publicKeyBase58 && (
              <SettingRow
                icon="copy-outline"
                label="Salin Alamat"
                value={`${publicKeyBase58.slice(0, 8)}...${publicKeyBase58.slice(-4)}`}
                onPress={handleCopyAddress}
                rightIcon="copy-outline"
              />
            )}
          </View>

          {/* Network */}
          <SectionHeader title="JARINGAN" />
          <View style={styles.card}>
            <SettingRow
              icon="globe-outline"
              label="Cluster"
              value={SOLANA_CLUSTER.toUpperCase()}
            />
            <SettingRow
              icon="code-slash-outline"
              label="Program ID"
              value={`${programId.slice(0, 8)}...${programId.slice(-4)}`}
              onPress={() => {
                Clipboard.setString(programId);
                Alert.alert("✅ Disalin!", "Program ID disalin ke clipboard.");
              }}
              rightIcon="copy-outline"
            />
            <SettingRow
              icon="server-outline"
              label="Explorer"
              value="explorer.solana.com/devnet"
            />
          </View>

          {/* App Info */}
          <SectionHeader title="APLIKASI" />
          <View style={styles.card}>
            <SettingRow icon="information-circle-outline" label="Versi" value={`EcoQuest v${APP_VERSION}`} />
            <SettingRow
              icon="document-text-outline"
              label="Smart Contract Audit"
              value="Anchor · Devnet · Open Source"
            />
            <SettingRow
              icon="shield-checkmark-outline"
              label="Anti-Cheat"
              value="GPS 7-Layer Validation"
            />
            <SettingRow
              icon="cloud-upload-outline"
              label="Storage"
              value="Pinata IPFS + Irys Arweave"
            />
          </View>

          {/* Danger Zone */}
          <SectionHeader title="AKUN" />
          <View style={styles.card}>
            <SettingRow
              icon="log-out-outline"
              label="Disconnect Wallet"
              onPress={handleDisconnect}
              danger
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              EcoQuest Mobile · Solana Mobile Hackathon 2025{"\n"}
              Built with ❤️ for the planet 🌿
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.dark },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border.medium },
  backBtn: { padding: 6 },
  title: { fontSize: 20, fontWeight: "bold", color: Colors.text.primary },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeader: { fontSize: 11, fontWeight: "700", color: Colors.text.muted, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  card: { backgroundColor: Colors.background.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.border.medium, overflow: "hidden", marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border.dark },
  rowIcon: { marginRight: 12 },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "600", color: Colors.text.primary },
  rowValue: { fontSize: 12, color: Colors.text.muted, marginTop: 2 },
  footer: { marginTop: 32, alignItems: "center" },
  footerText: { fontSize: 11, color: Colors.text.muted, textAlign: "center", lineHeight: 18 },
});
