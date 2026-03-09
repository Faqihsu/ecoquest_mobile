/**
 * WalletConnectScreen.tsx
 *
 * Clean Connect Wallet screen — one primary "Connect Wallet" button
 * that triggers MWA wallet selection (OS handles the chooser popup),
 * plus a secondary "Seeker (QR Scan)" button below.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  Dimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  FadeInDown,
  FadeInUp,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useWallet } from "../contexts/WalletContext";
import { Theme as T } from "../utils/theme";

const { width: W } = Dimensions.get("window");

// ── Pulsing Wallet Icon ───────────────────────────────────────────────────────

function PulsingWalletIcon() {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1600 }),
        withTiming(0.4, { duration: 1600 })
      ),
      -1,
      false
    );
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={s.walletIconWrap}>
      <Animated.View style={[s.walletIconGlow, glowStyle]} />
      <Animated.View style={[s.walletIconCore, iconStyle]}>
        <LinearGradient
          colors={[T.color.green.neon, "#00D4AA", T.color.ocean?.mid ?? "#0EA5E9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.walletIconGradient}
        >
          <Text style={s.walletIconEmoji}>🔗</Text>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

// ── Connecting Dots ───────────────────────────────────────────────────────────

function ConnectingDots({ color }: { color: string }) {
  const d1 = useSharedValue(0.3);
  const d2 = useSharedValue(0.3);
  const d3 = useSharedValue(0.3);

  useEffect(() => {
    const anim = (v: Animated.SharedValue<number>) => {
      v.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1,
        false
      );
    };
    setTimeout(() => anim(d1), 0);
    setTimeout(() => anim(d2), 150);
    setTimeout(() => anim(d3), 300);
  }, []);

  const s1 = useAnimatedStyle(() => ({ opacity: d1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: d2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: d3.value }));

  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
      {[s1, s2, s3].map((st, i) => (
        <Animated.View
          key={i}
          style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, st]}
        />
      ))}
    </View>
  );
}

// ── QR Scanner Modal ──────────────────────────────────────────────────────────

function QRScannerModal({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible && !permission?.granted) requestPermission();
    if (!visible) setScanned(false);
  }, [visible]);

  const handleBarCode = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    const cleaned = data.replace(/^solana:/i, "").split("?")[0].trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleaned)) {
      onScan(cleaned);
    } else {
      Alert.alert("QR Tidak Valid", "Kode QR harus berisi alamat Solana yang valid.", [
        { text: "Scan Ulang", onPress: () => setScanned(false) },
      ]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={qr.root}>
        <SafeAreaView style={qr.header}>
          <TouchableOpacity onPress={onClose} style={qr.closeBtn}>
            <Text style={qr.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={qr.title}>Scan QR Seeker</Text>
          <View style={{ width: 40 }} />
        </SafeAreaView>

        {!permission?.granted ? (
          <View style={qr.permBox}>
            <Text style={{ fontSize: 60, marginBottom: 16 }}>📷</Text>
            <Text style={qr.permTitle}>Izin Kamera Diperlukan</Text>
            <Text style={qr.permDesc}>
              EcoQuest perlu akses kamera untuk memindai QR Seeker.
            </Text>
            <TouchableOpacity style={qr.permBtn} onPress={requestPermission}>
              <Text style={qr.permBtnText}>Izinkan Kamera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              style={qr.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scanned ? undefined : handleBarCode}
            />
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={qr.overlay}>
                <View style={qr.frame}>
                  <View style={[qr.corner, qr.tl]} />
                  <View style={[qr.corner, qr.tr]} />
                  <View style={[qr.corner, qr.bl]} />
                  <View style={[qr.corner, qr.br]} />
                </View>
              </View>
            </View>
            <View style={qr.hint}>
              <Text style={qr.hintText}>
                Arahkan kamera ke kode QR dari Seeker / SMS 2.0
              </Text>
              {scanned && (
                <TouchableOpacity style={qr.rescanBtn} onPress={() => setScanned(false)}>
                  <Text style={qr.rescanText}>Scan Ulang</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const FRAME = 240;
const qr = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: T.color.bg.deep,
  },
  closeBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeText: { color: "#fff", fontSize: 20 },
  title: { fontSize: T.font.md, fontWeight: "700", color: "#fff" },
  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  frame: { width: FRAME, height: FRAME, backgroundColor: "transparent" },
  corner: { position: "absolute", width: 28, height: 28, borderColor: T.color.green.neon, borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  hint: { padding: 24, alignItems: "center", backgroundColor: T.color.bg.deep },
  hintText: { color: T.color.text.secondary, fontSize: T.font.sm, textAlign: "center", lineHeight: 20 },
  rescanBtn: {
    marginTop: 14,
    backgroundColor: T.color.green.glow,
    borderRadius: T.radius.full,
    borderWidth: 1,
    borderColor: T.color.green.neon,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  rescanText: { color: T.color.green.neon, fontWeight: "700", fontSize: T.font.sm },
  permBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  permTitle: { fontSize: T.font.lg, fontWeight: "800", color: "#fff", marginBottom: 8 },
  permDesc: { fontSize: T.font.sm, color: T.color.text.secondary, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  permBtn: { backgroundColor: T.color.green.neon, borderRadius: T.radius.full, paddingHorizontal: 32, paddingVertical: 14 },
  permBtnText: { color: T.color.text.inverse, fontWeight: "800", fontSize: T.font.sm },
});

// ── Success Overlay ───────────────────────────────────────────────────────────

function SuccessOverlay({ walletName }: { walletName: string }) {
  return (
    <Animated.View entering={FadeInUp.springify()} style={suc.overlay}>
      <LinearGradient
        colors={["rgba(0,255,135,0.15)", "rgba(3,7,18,0.98)"]}
        style={StyleSheet.absoluteFill}
      />
      <Text style={suc.icon}>✅</Text>
      <Text style={suc.title}>Terhubung!</Text>
      <Text style={suc.sub}>via {walletName}</Text>
    </Animated.View>
  );
}

const suc = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99,
    backgroundColor: T.color.bg.void,
  },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: T.font.xxl, fontWeight: "900", color: T.color.green.neon, marginBottom: 8 },
  sub: { fontSize: T.font.md, color: T.color.text.muted },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

const WalletConnectScreen = ({ navigation }: any) => {
  const { connectWithMWA, connectWithQR, connectAsDemo, connecting, connected, walletName } = useWallet();
  const [showQR, setShowQR] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Show success overlay when connected (navigation handled by App.tsx conditional rendering)
  useEffect(() => {
    if (connected && walletName) {
      setShowSuccess(true);
    }
  }, [connected, walletName]);

  const handleConnect = async () => {
    await connectWithMWA();
  };

  const handleQRScan = async (publicKey: string) => {
    setShowQR(false);
    await connectWithQR(publicKey);
  };

  const handleSkip = () => {
    Alert.alert("Demo Mode", "Lewati koneksi wallet. Beberapa fitur akan terbatas.", [
      { text: "Batal", style: "cancel" },
      { text: "Lanjut", onPress: () => connectAsDemo() },
    ]);
  };

  return (
    <View style={s.root}>
      {showSuccess && walletName && <SuccessOverlay walletName={walletName} />}

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* ── Header ── */}
          <Animated.View entering={FadeInDown.delay(0).springify()} style={s.header}>
            <LinearGradient
              colors={["rgba(0,255,135,0.10)", "transparent"]}
              style={s.headerGlow}
            />
            <View style={s.badge}>
              <Text style={s.badgeText}>🔐 SECURE</Text>
            </View>
            <Text style={s.title}>Connect Wallet</Text>
            <Text style={s.subtitle}>
              Hubungkan wallet Solana Anda untuk mulai menjelajah.
            </Text>
          </Animated.View>

          {/* ── Pulsing Icon ── */}
          <Animated.View entering={FadeInDown.delay(80).springify()} style={s.iconSection}>
            <PulsingWalletIcon />
          </Animated.View>

          {/* ── Primary: Connect Wallet ── */}
          <Animated.View entering={FadeInDown.delay(160).springify()} style={s.buttonSection}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={connecting}
              onPress={handleConnect}
            >
              <LinearGradient
                colors={[T.color.green.neon, "#00D4AA", T.color.ocean?.mid ?? "#0EA5E9"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.primaryBtn}
              >
                {connecting ? (
                  <View style={s.connectingRow}>
                    <Text style={s.primaryBtnText}>Menghubungkan</Text>
                    <ConnectingDots color="#fff" />
                  </View>
                ) : (
                  <>
                    <Text style={s.primaryBtnIcon}>🔗</Text>
                    <Text style={s.primaryBtnText}>Connect Wallet</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={s.supportedText}>
              Mendukung Phantom, Backpack, Jupiter, dan wallet Solana lainnya
            </Text>
          </Animated.View>

          {/* ── Secondary: Seeker QR Scan ── */}
          <Animated.View entering={FadeInDown.delay(240).springify()}>
            <TouchableOpacity
              style={s.secondaryBtn}
              activeOpacity={0.85}
              disabled={connecting}
              onPress={() => setShowQR(true)}
            >
              <View style={s.seekerLogo}>
                <Text style={s.seekerLogoText}>S</Text>
              </View>
              <View style={s.seekerInfo}>
                <Text style={s.seekerName}>Seeker</Text>
                <Text style={s.seekerSub}>Solana Mobile · Scan QR</Text>
              </View>
              <View style={s.qrBadge}>
                <Text style={s.qrBadgeText}>QR SCAN</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Info Card ── */}
          <Animated.View entering={FadeInDown.delay(320).springify()} style={s.infoCard}>
            <LinearGradient
              colors={["rgba(0,255,135,0.06)", "rgba(12,22,40,0.5)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={s.infoGreenLine} />
            <Text style={s.infoTitle}>Mengapa Perlu Wallet?</Text>
            {[
              "🎖️  Miliki bukti quest NFT on-chain",
              "💎  Stake SKR untuk reward 2x lipat",
              "⚔️   Kompetisi di PvP Arena",
              "🗳️   Voting quest baru di Governance",
            ].map((t, i) => (
              <Text key={i} style={s.infoItem}>{t}</Text>
            ))}
          </Animated.View>

          {/* ── Skip ── */}
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <TouchableOpacity style={s.skipBtn} onPress={handleSkip} disabled={connecting}>
              <Text style={s.skipText}>Skip for Demo →</Text>
            </TouchableOpacity>
          </Animated.View>

          <View style={s.footer}>
            <Text style={s.footerText}>🔒 Private key Anda tetap aman di wallet Anda</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <QRScannerModal visible={showQR} onClose={() => setShowQR(false)} onScan={handleQRScan} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.bg.void },
  scroll: { paddingHorizontal: 20, paddingVertical: 12, paddingBottom: 40 },

  // Header
  header: { marginBottom: 8, marginTop: 16, position: "relative" },
  headerGlow: {
    position: "absolute",
    top: -40,
    left: -40,
    right: -40,
    height: 180,
    borderRadius: 90,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,255,135,0.10)",
    borderRadius: T.radius.full,
    borderWidth: 1,
    borderColor: T.color.green.neon + "44",
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: T.color.green.neon, letterSpacing: 1.2 },
  title: { fontSize: T.font.hero, fontWeight: "900", color: T.color.text.primary, marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: T.font.sm, color: T.color.text.secondary, lineHeight: 20 },

  // Pulsing icon
  iconSection: { alignItems: "center", marginBottom: 24 },
  walletIconWrap: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  walletIconGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(0,255,135,0.15)",
  },
  walletIconCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
  },
  walletIconGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  walletIconEmoji: { fontSize: 32 },

  // Primary button
  buttonSection: { marginBottom: 16 },
  primaryBtn: {
    borderRadius: T.radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: T.color.green.neon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryBtnIcon: { fontSize: 22 },
  primaryBtnText: {
    fontSize: T.font.lg,
    fontWeight: "900",
    color: T.color.text.inverse,
    letterSpacing: 0.3,
  },
  connectingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  supportedText: {
    textAlign: "center",
    color: T.color.text.muted,
    fontSize: 11,
    marginTop: 10,
    lineHeight: 16,
  },

  // Secondary button (Seeker QR)
  secondaryBtn: {
    borderRadius: T.radius.lg,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#14b8a655",
    backgroundColor: T.color.bg.surface,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 28,
    shadowColor: "#14b8a6",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  seekerLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#14b8a6",
    justifyContent: "center",
    alignItems: "center",
  },
  seekerLogoText: { fontSize: 22, fontWeight: "900", color: "#fff" },
  seekerInfo: { flex: 1 },
  seekerName: { fontSize: T.font.md, fontWeight: "700", color: T.color.text.primary, marginBottom: 2 },
  seekerSub: { fontSize: T.font.xs, color: T.color.text.muted },
  qrBadge: {
    borderRadius: T.radius.sm,
    borderWidth: 1,
    borderColor: "#14b8a6",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  qrBadgeText: { fontSize: 10, fontWeight: "700", color: "#14b8a6", letterSpacing: 0.5 },

  // Info
  infoCard: {
    borderRadius: T.radius.lg,
    padding: 20,
    marginBottom: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: T.color.border.green,
  },
  infoGreenLine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: T.color.green.neon,
  },
  infoTitle: { fontSize: T.font.md, fontWeight: "800", color: T.color.green.neon, marginBottom: 14 },
  infoItem: { fontSize: T.font.sm, color: T.color.text.secondary, marginBottom: 9, lineHeight: 20 },

  // Skip
  skipBtn: {
    paddingVertical: 14,
    borderRadius: T.radius.md,
    borderWidth: 1.5,
    borderColor: T.color.amber + "80",
    backgroundColor: "rgba(251,191,36,0.07)",
    alignItems: "center",
    marginBottom: 24,
  },
  skipText: { fontSize: T.font.sm, fontWeight: "700", color: T.color.amber },

  // Footer
  footer: { paddingTop: 16, borderTopWidth: 1, borderTopColor: T.color.border.subtle },
  footerText: { textAlign: "center", color: T.color.text.muted, fontSize: 12 },
});

export default WalletConnectScreen;
