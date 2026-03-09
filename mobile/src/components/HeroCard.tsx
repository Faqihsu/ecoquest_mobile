/**
 * HeroCard.tsx
 * Kartu hero premium — Level Progress + SKR Balance
 * Glassmorphism + LinearGradient + Reanimated
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Theme as T } from "../utils/theme";

const { width: W } = Dimensions.get("window");

// ── XP Level Config ────────────────────────────────────────────────────────

const LEVEL_THRESHOLDS = [0, 500, 1200, 2500, 5000, 10000];

function getLevelInfo(xp: number) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold    = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[level - 1];
  const progress = nextThreshold === currentThreshold
    ? 1
    : (xp - currentThreshold) / (nextThreshold - currentThreshold);

  const titles = ["Seedling", "Sprout", "Sapling", "Guardian", "Elder", "Legend"];
  return { level, progress, title: titles[level - 1] ?? "Legend", nextThreshold };
}

// ── Animated XP Bar ────────────────────────────────────────────────────────

function XPBar({ progress }: { progress: number }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      400,
      withTiming(progress, { duration: 1200, easing: Easing.out(Easing.cubic) })
    );
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${interpolate(width.value, [0, 1], [0, 100])}%` as any,
  }));

  return (
    <View style={styles.xpBarBg}>
      <Animated.View style={[styles.xpBarFill, barStyle]}>
        <LinearGradient
          colors={[T.color.green.neon, T.color.ocean.bright]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Shimmer dot at tip */}
        <View style={styles.xpBarTip} />
      </Animated.View>
    </View>
  );
}

// ── SKR Counter ────────────────────────────────────────────────────────────

function SKRCounter({ value }: { value: number }) {
  const animValue = useSharedValue(0);

  useEffect(() => {
    animValue.value = withDelay(
      200,
      withTiming(value, { duration: 1000, easing: Easing.out(Easing.quad) })
    );
  }, [value]);

  // We use a simple display — for true number counting animation
  // we'd need a JS-driven approach; this fades in elegantly
  const fadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animValue.value, [0, value * 0.3, value], [0, 0.5, 1]),
  }));

  return (
    <Animated.Text style={[styles.skrAmount, fadeStyle]}>
      {value.toLocaleString("id-ID")}
    </Animated.Text>
  );
}

// ── Main HeroCard ──────────────────────────────────────────────────────────

interface HeroCardProps {
  username?: string;
  skrBalance: number;
  xp: number;
  questsCompleted: number;
  streak: number;
}

export default function HeroCard({
  username = "Eco Warrior",
  skrBalance,
  xp,
  questsCompleted,
  streak,
}: HeroCardProps) {
  const { level, progress, title, nextThreshold } = getLevelInfo(xp);

  const cardScale = useSharedValue(0.94);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    cardScale.value = withSpring(1, { damping: 14, stiffness: 160 });
    cardOpacity.value = withTiming(1, { duration: 400 });
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  return (
    <Animated.View style={[styles.cardWrapper, cardStyle]}>
      {/* Outer glow */}
      <View style={styles.glowRing} />

      <LinearGradient
        colors={["#0a1f2e", "#061428", "#030d1a"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Top row: greeting + level badge */}
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>Halo, {username} 👋</Text>
            <View style={styles.levelRow}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>Lv.{level}</Text>
              </View>
              <Text style={styles.levelTitle}>{title}</Text>
            </View>
          </View>

          {/* Streak badge */}
          <View style={styles.streakBadge}>
            <Text style={styles.streakFire}>🔥</Text>
            <Text style={styles.streakCount}>{streak}</Text>
            <Text style={styles.streakLabel}>hari</Text>
          </View>
        </View>

        {/* SKR Balance — hero element */}
        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Saldo $SKR</Text>
          <View style={styles.balanceRow}>
            <SKRCounter value={skrBalance} />
            <Text style={styles.skrSymbol}> SKR</Text>
          </View>
        </View>

        {/* XP Progress */}
        <View style={styles.xpSection}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpLabel}>XP Progress</Text>
            <Text style={styles.xpTarget}>
              {xp.toLocaleString()} / {nextThreshold.toLocaleString()} XP
            </Text>
          </View>
          <XPBar progress={progress} />
          <Text style={styles.xpSubtext}>
            {Math.round(progress * 100)}% menuju Level {level + 1}
          </Text>
        </View>

        {/* Bottom stats */}
        <View style={styles.statsRow}>
          <StatChip icon="✅" value={questsCompleted} label="Quest" />
          <View style={styles.statDivider} />
          <StatChip icon="🌱" value={Math.floor(xp / 50)} label="Pohon" />
          <View style={styles.statDivider} />
          <StatChip icon="💨" value={`${(xp * 0.02).toFixed(1)}kg`} label="CO₂" />
        </View>

        {/* Decorative corner accent */}
        <View style={styles.cornerAccent} />
      </LinearGradient>
    </Animated.View>
  );
}

function StatChip({
  icon,
  value,
  label,
}: {
  icon: string;
  value: number | string;
  label: string;
}) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const CARD_W = W - 40;

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
  },
  glowRing: {
    position: "absolute",
    top: -1,
    bottom: -1,
    left: -1,
    right: -1,
    borderRadius: T.radius.xl + 2,
    borderWidth: 1,
    borderColor: T.color.border.green,
    shadowColor: T.color.green.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 0,
  },
  card: {
    borderRadius: T.radius.xl,
    padding: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: T.color.border.green,
    ...T.shadow.card,
  },
  cornerAccent: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: T.color.green.glowSm,
  },

  // Top row
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  greeting: {
    fontSize: T.font.md,
    color: T.color.text.secondary,
    marginBottom: 6,
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  levelBadge: {
    backgroundColor: T.color.green.glow,
    borderWidth: 1,
    borderColor: T.color.border.green,
    borderRadius: T.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelBadgeText: {
    fontSize: T.font.xs,
    fontWeight: "800",
    color: T.color.green.neon,
    letterSpacing: 0.5,
  },
  levelTitle: {
    fontSize: T.font.sm,
    fontWeight: "700",
    color: T.color.text.primary,
  },
  streakBadge: {
    alignItems: "center",
    backgroundColor: "rgba(251, 191, 36, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.25)",
    borderRadius: T.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  streakFire: { fontSize: 18 },
  streakCount: {
    fontSize: T.font.lg,
    fontWeight: "800",
    color: T.color.amber,
    lineHeight: 22,
  },
  streakLabel: {
    fontSize: 9,
    color: T.color.text.muted,
    fontWeight: "600",
  },

  // Balance
  balanceSection: { marginBottom: 20 },
  balanceLabel: {
    fontSize: T.font.xs,
    color: T.color.text.muted,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  skrAmount: {
    fontSize: T.font.hero,
    fontWeight: "900",
    color: T.color.green.neon,
    letterSpacing: -1,
    textShadowColor: T.color.green.neon,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  skrSymbol: {
    fontSize: T.font.lg,
    fontWeight: "700",
    color: T.color.green.bright,
    marginBottom: 6,
  },

  // XP
  xpSection: { marginBottom: 20 },
  xpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  xpLabel: {
    fontSize: T.font.xs,
    color: T.color.text.muted,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  xpTarget: {
    fontSize: T.font.xs,
    color: T.color.text.secondary,
    fontWeight: "600",
  },
  xpBarBg: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 6,
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  xpBarTip: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: "#fff",
    opacity: 0.8,
    borderRadius: 2,
  },
  xpSubtext: {
    fontSize: 10,
    color: T.color.text.muted,
    textAlign: "right",
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: T.radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: T.color.border.subtle,
  },
  statChip: { alignItems: "center", flex: 1 },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: T.color.border.subtle,
  },
  statIcon: { fontSize: 16, marginBottom: 2 },
  statValue: {
    fontSize: T.font.md,
    fontWeight: "800",
    color: T.color.text.primary,
  },
  statLabel: {
    fontSize: 10,
    color: T.color.text.muted,
    fontWeight: "600",
    marginTop: 1,
  },
});
