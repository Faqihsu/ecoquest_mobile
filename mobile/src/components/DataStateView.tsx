/**
 * components/DataStateView.tsx
 *
 * Reusable UI primitives for on-chain data loading states.
 * Premium design with shimmer animations and glassmorphism error cards.
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W } = Dimensions.get('window');

// ── Shimmer Loading Skeleton ─────────────────────────────────────────────────

interface LoadingShimmerProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export function LoadingShimmer({
  width: w = '100%',
  height = 20,
  borderRadius = 8,
  style,
}: LoadingShimmerProps) {
  const shimmerX = useSharedValue(-1);

  useEffect(() => {
    shimmerX.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,   // infinite
      true,  // reverse
    );
  }, [shimmerX]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.4 * ((shimmerX.value + 1) / 2),
  }));

  return (
    <Animated.View
      style={[
        {
          width: w as any,
          height,
          borderRadius,
          backgroundColor: 'rgba(255,255,255,0.08)',
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// ── Balance Shimmer (specific layout for balance cards) ──────────────────────

export function BalanceShimmer() {
  return (
    <View style={shimmerStyles.balanceContainer}>
      <LoadingShimmer width={60} height={14} borderRadius={4} />
      <LoadingShimmer
        width={120}
        height={28}
        borderRadius={6}
        style={{ marginTop: 6 }}
      />
    </View>
  );
}

// ── NFT Grid Shimmer ─────────────────────────────────────────────────────────

export function NFTGridShimmer({ count = 3 }: { count?: number }) {
  return (
    <View style={shimmerStyles.nftGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <LoadingShimmer
          key={i}
          width={(W - 80) / 3}
          height={(W - 80) / 3}
          borderRadius={12}
        />
      ))}
    </View>
  );
}

const shimmerStyles = StyleSheet.create({
  balanceContainer: {
    alignItems: 'flex-start',
    gap: 4,
  },
  nftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

// ── Error State ──────────────────────────────────────────────────────────────

interface DataErrorProps {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function DataError({
  message = 'Gagal memuat data on-chain',
  onRetry,
  compact = false,
}: DataErrorProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[errorStyles.container, compact && errorStyles.compact]}
    >
      <LinearGradient
        colors={['rgba(239,68,68,0.08)', 'rgba(239,68,68,0.02)']}
        style={StyleSheet.absoluteFill}
      />
      <Text style={errorStyles.icon}>{compact ? '⚠️' : '🔌'}</Text>
      <Text style={errorStyles.title}>
        {compact ? 'Error' : 'Koneksi RPC Gagal'}
      </Text>
      <Text style={errorStyles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={errorStyles.retryBtn}
          onPress={onRetry}
          activeOpacity={0.7}
        >
          <Text style={errorStyles.retryText}>🔄 Coba Lagi</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    overflow: 'hidden',
  },
  compact: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 0,
    borderRadius: 10,
    flexDirection: 'row' as any,
    gap: 8,
  },
  icon: { fontSize: 32, marginBottom: 8 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f87171',
    marginBottom: 4,
  },
  message: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f87171',
  },
});

// ── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title?: string;
  message?: string;
}

export function EmptyState({
  icon = '📭',
  title = 'Belum Ada Data',
  message = 'Data akan muncul setelah ada aktivitas on-chain.',
}: EmptyStateProps) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>{icon}</Text>
      <Text style={emptyStyles.title}>{title}</Text>
      <Text style={emptyStyles.message}>{message}</Text>
    </Animated.View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderStyle: 'dashed',
  },
  icon: { fontSize: 36, marginBottom: 8 },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  message: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 18,
  },
});
