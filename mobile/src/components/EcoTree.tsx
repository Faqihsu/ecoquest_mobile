/**
 * EcoTree.tsx — Dynamic Growth Tree
 *
 * A visual tree that grows based on ECO Points progress (points / 500).
 * Uses react-native-reanimated for smooth spring-based transitions.
 *
 * Growth stages:
 *   0%    → Seed (small dot)
 *   1-20% → Seedling (trunk + tiny crown)
 *   21-40% → Sapling (taller trunk + small crown + few leaves)
 *   41-60% → Young Tree (medium trunk + medium crown + leaves)
 *   61-80% → Mature Tree (tall trunk + large crown + many leaves + branches)
 *   81-100% → Full Tree (majestic, glowing, fully bloomed with particles)
 *
 * When points change, the tree smoothly transitions to its new size
 * with a satisfying spring animation (reward feeling).
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  interpolateColor,
  Easing,
  SharedValue,
} from 'react-native-reanimated';

// ── Props ─────────────────────────────────────────────────────────────────────

interface EcoTreeProps {
  /** Current ECO points (0–500+) */
  ecoPoints: number;
  /** Max points for 100% growth (default: 500) */
  maxPoints?: number;
  /** Tree container size (default: 200) */
  size?: number;
  /** Show points label below tree */
  showLabel?: boolean;
}

// ── Spring Config ─────────────────────────────────────────────────────────────

const GROWTH_SPRING = {
  damping: 12,
  stiffness: 80,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
};

const BOUNCE_SPRING = {
  damping: 8,
  stiffness: 150,
  mass: 0.5,
};

// ── Leaf Component ────────────────────────────────────────────────────────────

function AnimatedLeaf({
  progress,
  x,
  y,
  leafSize,
  delay,
  color,
}: {
  progress: SharedValue<number>;
  x: number;
  y: number;
  leafSize: number;
  delay: number;
  color: string;
}) {
  const animStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 0.3, 1], [0, 0, 1]);
    const opacity = interpolate(progress.value, [0, 0.3, 0.5, 1], [0, 0, 0.7, 1]);
    return {
      transform: [{ scale: withDelay(delay, withSpring(scale, BOUNCE_SPRING)) }],
      opacity: withDelay(delay, withTiming(opacity, { duration: 400 })),
    };
  }, []);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: leafSize,
          height: leafSize,
          borderRadius: leafSize / 2,
          backgroundColor: color,
          left: x - leafSize / 2,
          top: y - leafSize / 2,
        },
        animStyle,
      ]}
    />
  );
}

// ── Particle (sparkle on level-up) ────────────────────────────────────────────

function SparkleParticle({
  progress,
  x,
  y,
  delay,
}: {
  progress: SharedValue<number>;
  x: number;
  y: number;
  delay: number;
}) {
  const animStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 0.5, 1], [0, 1.5, 0]);
    const opacity = interpolate(progress.value, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);
    const translateY = interpolate(progress.value, [0, 1], [0, -20]);
    return {
      transform: [
        { scale: withDelay(delay, withSpring(scale, BOUNCE_SPRING)) },
        { translateY: withDelay(delay, withTiming(translateY, { duration: 800 })) },
      ],
      opacity: withDelay(delay, withTiming(opacity, { duration: 800 })),
    };
  }, []);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: '#fbbf24',
          left: x,
          top: y,
        },
        animStyle,
      ]}
    />
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EcoTree({
  ecoPoints,
  maxPoints = 500,
  size = 200,
  showLabel = true,
}: EcoTreeProps) {
  const progress = useSharedValue(0);
  const sparkle = useSharedValue(0);

  const percentage = Math.min(1, Math.max(0, ecoPoints / maxPoints));

  // Animate when points change
  useEffect(() => {
    progress.value = withSpring(percentage, GROWTH_SPRING);

    // Trigger sparkle burst on point increase
    sparkle.value = 0;
    sparkle.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );
  }, [ecoPoints, percentage]);

  // ── Trunk ──────────────────────────────────────────────────────────────
  const trunkStyle = useAnimatedStyle(() => {
    const height = interpolate(progress.value, [0, 0.1, 0.5, 1], [4, 20, 50, 70]);
    const width = interpolate(progress.value, [0, 0.1, 0.5, 1], [3, 6, 10, 14]);
    const color = interpolateColor(
      progress.value,
      [0, 0.3, 0.7, 1],
      ['#92400e', '#78350f', '#6b3a10', '#5c2d0a'],
    );

    return {
      width: withSpring(width, GROWTH_SPRING),
      height: withSpring(height, GROWTH_SPRING),
      backgroundColor: color,
      borderRadius: withSpring(width / 3, GROWTH_SPRING),
    };
  }, []);

  // ── Crown (main foliage) ──────────────────────────────────────────────
  const crownStyle = useAnimatedStyle(() => {
    const crownSize = interpolate(progress.value, [0, 0.1, 0.4, 0.7, 1], [0, 15, 40, 65, 85]);
    const opacity = interpolate(progress.value, [0, 0.05, 0.15, 1], [0, 0, 1, 1]);
    const color = interpolateColor(
      progress.value,
      [0, 0.3, 0.6, 1],
      ['#86efac', '#4ade80', '#22c55e', '#16a34a'],
    );

    return {
      width: withSpring(crownSize, GROWTH_SPRING),
      height: withSpring(crownSize, GROWTH_SPRING),
      borderRadius: withSpring(crownSize / 2, GROWTH_SPRING),
      backgroundColor: color,
      opacity: withSpring(opacity, GROWTH_SPRING),
    };
  }, []);

  // ── Secondary crown layers ────────────────────────────────────────────
  const crown2Style = useAnimatedStyle(() => {
    const crownSize = interpolate(progress.value, [0, 0.3, 0.6, 1], [0, 0, 30, 60]);
    const offsetX = interpolate(progress.value, [0, 0.5, 1], [0, -15, -22]);
    const opacity = interpolate(progress.value, [0, 0.3, 0.5, 1], [0, 0, 0.8, 1]);

    return {
      width: withSpring(crownSize, GROWTH_SPRING),
      height: withSpring(crownSize, GROWTH_SPRING),
      borderRadius: withSpring(crownSize / 2, GROWTH_SPRING),
      transform: [{ translateX: withSpring(offsetX, GROWTH_SPRING) }],
      opacity: withSpring(opacity, GROWTH_SPRING),
    };
  }, []);

  const crown3Style = useAnimatedStyle(() => {
    const crownSize = interpolate(progress.value, [0, 0.3, 0.6, 1], [0, 0, 25, 55]);
    const offsetX = interpolate(progress.value, [0, 0.5, 1], [0, 15, 20]);
    const opacity = interpolate(progress.value, [0, 0.3, 0.5, 1], [0, 0, 0.8, 1]);

    return {
      width: withSpring(crownSize, GROWTH_SPRING),
      height: withSpring(crownSize, GROWTH_SPRING),
      borderRadius: withSpring(crownSize / 2, GROWTH_SPRING),
      transform: [{ translateX: withSpring(offsetX, GROWTH_SPRING) }],
      opacity: withSpring(opacity, GROWTH_SPRING),
    };
  }, []);

  // ── Glow effect for mature trees ──────────────────────────────────────
  const glowStyle = useAnimatedStyle(() => {
    const glowSize = interpolate(progress.value, [0, 0.7, 1], [0, 0, 110]);
    const opacity = interpolate(progress.value, [0, 0.7, 0.85, 1], [0, 0, 0.15, 0.3]);

    return {
      width: withSpring(glowSize, GROWTH_SPRING),
      height: withSpring(glowSize, GROWTH_SPRING),
      borderRadius: withSpring(glowSize / 2, GROWTH_SPRING),
      opacity: withSpring(opacity, GROWTH_SPRING),
    };
  }, []);

  // ── Seed dot ──────────────────────────────────────────────────────────
  const seedStyle = useAnimatedStyle(() => {
    const seedSize = interpolate(progress.value, [0, 0.05, 0.15], [10, 12, 0]);
    const opacity = interpolate(progress.value, [0, 0.05, 0.12], [1, 1, 0]);

    return {
      width: withSpring(seedSize, GROWTH_SPRING),
      height: withSpring(seedSize, GROWTH_SPRING),
      borderRadius: withSpring(seedSize / 2, GROWTH_SPRING),
      opacity: withSpring(opacity, GROWTH_SPRING),
    };
  }, []);

  // ── Branches ──────────────────────────────────────────────────────────
  const leftBranchStyle = useAnimatedStyle(() => {
    const width = interpolate(progress.value, [0, 0.4, 0.7, 1], [0, 0, 18, 30]);
    const height = interpolate(progress.value, [0, 0.4, 0.7, 1], [0, 0, 3, 5]);
    const rotate = interpolate(progress.value, [0, 0.7, 1], [0, -30, -35]);
    const opacity = interpolate(progress.value, [0, 0.4, 0.55, 1], [0, 0, 1, 1]);

    return {
      width: withSpring(width, GROWTH_SPRING),
      height: withSpring(height, GROWTH_SPRING),
      transform: [{ rotate: `${rotate}deg` }],
      opacity: withSpring(opacity, GROWTH_SPRING),
    };
  }, []);

  const rightBranchStyle = useAnimatedStyle(() => {
    const width = interpolate(progress.value, [0, 0.4, 0.7, 1], [0, 0, 18, 30]);
    const height = interpolate(progress.value, [0, 0.4, 0.7, 1], [0, 0, 3, 5]);
    const rotate = interpolate(progress.value, [0, 0.7, 1], [0, 30, 35]);
    const opacity = interpolate(progress.value, [0, 0.4, 0.55, 1], [0, 0, 1, 1]);

    return {
      width: withSpring(width, GROWTH_SPRING),
      height: withSpring(height, GROWTH_SPRING),
      transform: [{ rotate: `${rotate}deg` }],
      opacity: withSpring(opacity, GROWTH_SPRING),
    };
  }, []);

  // ── Leaf positions ────────────────────────────────────────────────────
  const leaves = useMemo(() => {
    const cx = size / 2;
    const cy = size * 0.28;
    return [
      // Inner leaves
      { x: cx - 18, y: cy - 12, s: 10, d: 100, c: '#4ade80' },
      { x: cx + 20, y: cy - 8, s: 9, d: 200, c: '#86efac' },
      { x: cx - 8, y: cy - 22, s: 11, d: 300, c: '#22c55e' },
      { x: cx + 12, y: cy - 20, s: 8, d: 400, c: '#4ade80' },
      // Outer leaves (appear at higher growth)
      { x: cx - 30, y: cy - 2, s: 8, d: 500, c: '#86efac' },
      { x: cx + 32, y: cy + 2, s: 9, d: 600, c: '#22c55e' },
      { x: cx, y: cy - 32, s: 10, d: 700, c: '#16a34a' },
      { x: cx - 22, y: cy + 8, s: 7, d: 800, c: '#4ade80' },
      { x: cx + 24, y: cy + 10, s: 8, d: 900, c: '#86efac' },
      // Fruit / flowers at high growth
      { x: cx - 14, y: cy + 4, s: 6, d: 1000, c: '#f97316' },
      { x: cx + 16, y: cy - 4, s: 6, d: 1100, c: '#f97316' },
      { x: cx + 2, y: cy - 14, s: 5, d: 1200, c: '#fbbf24' },
    ];
  }, [size]);

  // ── Sparkle positions ─────────────────────────────────────────────────
  const sparkles = useMemo(() => {
    const cx = size / 2;
    const cy = size * 0.3;
    return [
      { x: cx - 25, y: cy - 30, d: 0 },
      { x: cx + 20, y: cy - 25, d: 100 },
      { x: cx - 10, y: cy - 40, d: 200 },
      { x: cx + 30, y: cy - 10, d: 300 },
      { x: cx - 35, y: cy + 5, d: 400 },
      { x: cx, y: cy - 45, d: 150 },
    ];
  }, [size]);

  // ── Stage label ───────────────────────────────────────────────────────
  const stage = useMemo(() => {
    if (percentage <= 0) return { label: '🌱 Seed', color: '#92400e' };
    if (percentage <= 0.2) return { label: '🌿 Seedling', color: '#86efac' };
    if (percentage <= 0.4) return { label: '🌳 Sapling', color: '#4ade80' };
    if (percentage <= 0.6) return { label: '🌲 Young Tree', color: '#22c55e' };
    if (percentage <= 0.8) return { label: '🌴 Mature Tree', color: '#16a34a' };
    return { label: '✨ Ancient Tree', color: '#fbbf24' };
  }, [percentage]);

  const cx = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size + 40 }]}>
      {/* Glow (background, for 80%+ trees) */}
      <Animated.View
        style={[
          styles.glow,
          { left: cx - 55, top: size * 0.2 - 10 },
          glowStyle,
        ]}
      />

      {/* Ground / soil line */}
      <View style={[styles.ground, { top: size * 0.78, width: size * 0.5, left: size * 0.25 }]} />

      {/* Seed (visible only at 0%) */}
      <Animated.View
        style={[
          styles.seed,
          { left: cx - 5, top: size * 0.74 },
          seedStyle,
        ]}
      />

      {/* Trunk */}
      <Animated.View
        style={[
          styles.trunk,
          { left: cx - 7, bottom: size * 0.22 },
          trunkStyle,
        ]}
      />

      {/* Left branch */}
      <Animated.View
        style={[
          styles.branch,
          { left: cx - 20, top: size * 0.42 },
          leftBranchStyle,
        ]}
      />

      {/* Right branch */}
      <Animated.View
        style={[
          styles.branch,
          { left: cx, top: size * 0.45 },
          rightBranchStyle,
        ]}
      />

      {/* Crown layers (back to front for depth) */}
      <Animated.View
        style={[
          styles.crown,
          { left: cx - 30, top: size * 0.18, backgroundColor: '#16a34a' },
          crown2Style,
        ]}
      />
      <Animated.View
        style={[
          styles.crown,
          { left: cx - 30, top: size * 0.2, backgroundColor: '#22c55e' },
          crown3Style,
        ]}
      />
      <Animated.View
        style={[
          styles.crown,
          { left: cx - 42, top: size * 0.12 },
          crownStyle,
        ]}
      />

      {/* Leaves */}
      {leaves.map((leaf, i) => (
        <AnimatedLeaf
          key={i}
          progress={progress}
          x={leaf.x}
          y={leaf.y}
          leafSize={leaf.s}
          delay={leaf.d}
          color={leaf.c}
        />
      ))}

      {/* Sparkle particles (burst on point change) */}
      {sparkles.map((s, i) => (
        <SparkleParticle
          key={i}
          progress={sparkle}
          x={s.x}
          y={s.y}
          delay={s.d}
        />
      ))}

      {/* Labels */}
      {showLabel && (
        <View style={[styles.labelArea, { top: size + 4 }]}>
          <Text style={[styles.stageLabel, { color: stage.color }]}>{stage.label}</Text>
          <Text style={styles.pointsLabel}>
            {ecoPoints} / {maxPoints} ECO
          </Text>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(percentage * 100)}%`,
                  backgroundColor: stage.color,
                },
              ]}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  seed: {
    position: 'absolute',
    backgroundColor: '#92400e',
  },
  trunk: {
    position: 'absolute',
    backgroundColor: '#78350f',
  },
  branch: {
    position: 'absolute',
    backgroundColor: '#78350f',
    borderRadius: 2,
  },
  crown: {
    position: 'absolute',
  },
  ground: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(120, 53, 15, 0.3)',
  },
  labelArea: {
    position: 'absolute',
    alignItems: 'center',
    width: '100%',
  },
  stageLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pointsLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  progressTrack: {
    width: '80%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
