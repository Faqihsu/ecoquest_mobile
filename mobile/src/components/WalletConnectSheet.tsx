/**
 * WalletConnectSheet.tsx
 * Native-feel Solana Mobile Wallet Adapter connect UI
 * Frictionless Web3 UX — bukan tombol kaku, tapi experience yang menyatu
 */

import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Theme as T } from "../utils/theme";

const { width: W } = Dimensions.get("window");

// ── Pulsing Orb ────────────────────────────────────────────────────────────

function PulsingOrb() {
  const scale1 = useSharedValue(1);
  const scale2 = useSharedValue(1);
  const opacity1 = useSharedValue(0.6);
  const opacity2 = useSharedValue(0.3);

  useEffect(() => {
    scale1.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    scale2.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    opacity1.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 1800 }),
        withTiming(0.4, { duration: 1800 })
      ),
      -1,
      false
    );
    opacity2.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 2400 }),
        withTiming(0.1, { duration: 2400 })
      ),
      -1,
      false
    );
  }, []);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    opacity: opacity1.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: scale2.value }],
    opacity: opacity2.value,
  }));

  return (
    <View style={styles.orbContainer}>
      <Animated.View style={[styles.orbRing2, ring2Style]} />
      <Animated.View style={[styles.orbRing1, ring1Style]} />
      <LinearGradient
        colors={[T.color.green.neon, T.color.ocean.mid]}
        style={styles.orbCore}
      >
        <Text style={styles.orbEmoji}>🌍</Text>
      </LinearGradient>
    </View>
  );
}

// ── Wallet Option Button ────────────────────────────────────────────────────

function WalletOption({
  icon,
  name,
  subtitle,
  isPrimary,
  onPress,
}: {
  icon: string;
  name: string;
  subtitle: string;
  isPrimary?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.96, { damping: 8, stiffness: 400 }, () => {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    });
    Haptics.impactAsync(
      isPrimary
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light
    );
    onPress();
  };

  if (isPrimary) {
    return (
      <Animated.View style={animStyle}>
        <TouchableOpacity onPress={handlePress} activeOpacity={1}>
          <LinearGradient
            colors={[T.color.green.neon, T.color.green.bright, T.color.ocean.mid]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryWalletBtn}
          >
            <Text style={styles.walletBtnIcon}>{icon}</Text>
            <View style={styles.walletBtnText}>
              <Text style={styles.walletBtnName}>{name}</Text>
              <Text style={styles.walletBtnSubtitle}>{subtitle}</Text>
            </View>
            <View style={styles.walletBtnArrow}>
              <Text style={{ color: T.color.text.inverse, fontSize: 16 }}>›</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        style={styles.secondaryWalletBtn}
        onPress={handlePress}
        activeOpacity={1}
      >
        <Text style={styles.walletBtnIcon}>{icon}</Text>
        <View style={styles.walletBtnText}>
          <Text style={[styles.walletBtnName, { color: T.color.text.primary }]}>{name}</Text>
          <Text style={styles.walletBtnSubtitle}>{subtitle}</Text>
        </View>
        <View style={[styles.walletBtnArrow, { backgroundColor: T.color.border.subtle }]}>
          <Text style={{ color: T.color.text.secondary, fontSize: 16 }}>›</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface WalletConnectSheetProps {
  onConnect: (walletType: "seedvault" | "phantom" | "backpack") => void;
}

export default function WalletConnectSheet({ onConnect }: WalletConnectSheetProps) {
  const slideY = useSharedValue(60);
  const opacity = useSharedValue(0);

  useEffect(() => {
    slideY.value = withSpring(0, { damping: 18, stiffness: 180 });
    opacity.value = withTiming(1, { duration: 350 });
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Orb */}
      <PulsingOrb />

      {/* Headline */}
      <Text style={styles.headline}>Mulai Perjalanan{"\n"}Eco-mu 🌿</Text>
      <Text style={styles.subheadline}>
        Hubungkan wallet Solana-mu untuk mulai{"\n"}menyelesaikan quest & mengumpulkan $SKR
      </Text>

      {/* Feature pills */}
      <View style={styles.featurePills}>
        {["🔒 Non-custodial", "⚡ SMS 2.0", "🌱 Eco Rewards"].map((f) => (
          <View key={f} style={styles.featurePill}>
            <Text style={styles.featurePillText}>{f}</Text>
          </View>
        ))}
      </View>

      {/* Wallet options */}
      <View style={styles.walletList}>
        <WalletOption
          icon="🔐"
          name="Seed Vault"
          subtitle="Direkomendasikan untuk Seeker"
          isPrimary
          onPress={() => onConnect("seedvault")}
        />
        <WalletOption
          icon="👻"
          name="Phantom"
          subtitle="Mobile Wallet Adapter"
          onPress={() => onConnect("phantom")}
        />
        <WalletOption
          icon="🎒"
          name="Backpack"
          subtitle="xNFT Wallet"
          onPress={() => onConnect("backpack")}
        />
      </View>

      {/* Disclaimer */}
      <Text style={styles.disclaimer}>
        Dengan menghubungkan wallet, kamu menyetujui{" "}
        <Text style={styles.disclaimerLink}>Syarat & Ketentuan</Text> EcoQuest.
        Kami tidak pernah menyimpan private key-mu.
      </Text>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    backgroundColor: T.color.bg.deep,
  },

  // Orb
  orbContainer: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
  },
  orbRing2: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: T.color.green.glowSm,
  },
  orbRing1: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: T.color.green.glow,
  },
  orbCore: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: T.color.green.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  orbEmoji: { fontSize: 30 },

  // Text
  headline: {
    fontSize: T.font.xxl,
    fontWeight: "900",
    color: T.color.text.primary,
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 12,
  },
  subheadline: {
    fontSize: T.font.sm,
    color: T.color.text.secondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },

  // Feature pills
  featurePills: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  featurePill: {
    backgroundColor: T.color.green.glowSm,
    borderWidth: 1,
    borderColor: T.color.border.green,
    borderRadius: T.radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  featurePillText: {
    fontSize: T.font.xs,
    color: T.color.green.bright,
    fontWeight: "600",
  },

  // Wallet list
  walletList: {
    width: "100%",
    gap: 10,
    marginBottom: 24,
  },
  primaryWalletBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: T.radius.lg,
    padding: 16,
    gap: 12,
    shadowColor: T.color.green.neon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  secondaryWalletBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.color.bg.surface,
    borderRadius: T.radius.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: T.color.border.light,
  },
  walletBtnIcon: { fontSize: 28 },
  walletBtnText: { flex: 1 },
  walletBtnName: {
    fontSize: T.font.md,
    fontWeight: "700",
    color: T.color.text.inverse,
  },
  walletBtnSubtitle: {
    fontSize: T.font.xs,
    color: "rgba(0,0,0,0.55)",
    marginTop: 2,
  },
  walletBtnArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Disclaimer
  disclaimer: {
    fontSize: 11,
    color: T.color.text.muted,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  disclaimerLink: {
    color: T.color.green.bright,
    fontWeight: "600",
  },
});
