// ─────────────────────────────────────────────────────────────────────────────
// TransactionToast — Hackathon-grade animated transaction lifecycle toast
//
// 4 visual states:
//   1. awaiting_approval  → spinning loader + pulse glow
//   2. confirming         → blockchain wave dots
//   3. success            → checkmark bounce-in + Solscan link
//   4. error              → shake + friendly message
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors } from '../utils/colors';
import { getSolscanTxUrl } from '../shared/lib/explorer';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastState = 'awaiting_approval' | 'confirming' | 'success' | 'error';

export interface TransactionToastProps {
  /** Current visual state */
  state: ToastState;
  /** Human-readable label (e.g. "Stake 100 SKR") */
  label: string;
  /** Transaction signature — used for Solscan link on success */
  signature?: string;
  /** User-friendly error message */
  errorMessage?: string;
  /** Called when user taps dismiss or auto-dismiss fires */
  onDismiss: () => void;
  /** Whether the toast is visible */
  visible: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOAST_WIDTH = SCREEN_WIDTH - 32;
const AUTO_DISMISS_MS = 5000;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Spinning loader for awaiting_approval state */
function SpinnerIcon() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1, // infinite
      false
    );
    return () => cancelAnimation(rotation);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.iconContainer, animStyle]}>
      <View style={styles.spinnerRing} />
    </Animated.View>
  );
}

/** Pulsing dots for confirming state */
function BlockchainDots() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    dot1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 })
      ),
      -1
    );
    dot2.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1
      )
    );
    dot3.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1
      )
    );
    return () => {
      cancelAnimation(dot1);
      cancelAnimation(dot2);
      cancelAnimation(dot3);
    };
  }, []);

  const s1 = useAnimatedStyle(() => ({ opacity: dot1.value, transform: [{ scale: dot1.value }] }));
  const s2 = useAnimatedStyle(() => ({ opacity: dot2.value, transform: [{ scale: dot2.value }] }));
  const s3 = useAnimatedStyle(() => ({ opacity: dot3.value, transform: [{ scale: dot3.value }] }));

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, { backgroundColor: Colors.secondary.teal }, s1]} />
      <Animated.View style={[styles.dot, { backgroundColor: Colors.accent.primary }, s2]} />
      <Animated.View style={[styles.dot, { backgroundColor: Colors.secondary.blue }, s3]} />
    </View>
  );
}

/** Checkmark icon for success state */
function CheckmarkIcon() {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 150 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  return (
    <Animated.View style={[styles.iconContainer, styles.successCircle, animStyle]}>
      <Text style={styles.checkmark}>✓</Text>
    </Animated.View>
  );
}

/** Warning icon for error state */
function ErrorIcon() {
  const shakeX = useSharedValue(0);

  useEffect(() => {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 60 }),
      withRepeat(
        withSequence(
          withTiming(8, { duration: 80 }),
          withTiming(-8, { duration: 80 })
        ),
        3,
        true
      ),
      withTiming(0, { duration: 60 })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <Animated.View style={[styles.iconContainer, styles.errorCircle, animStyle]}>
      <Text style={styles.errorExclamation}>!</Text>
    </Animated.View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TransactionToast({
  state,
  label,
  signature,
  errorMessage,
  onDismiss,
  visible,
}: TransactionToastProps) {
  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);
  const pulseGlow = useSharedValue(0);

  // Slide in/out
  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 14, stiffness: 120 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(-120, { duration: 250 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  // Pulse glow for awaiting_approval
  useEffect(() => {
    if (state === 'awaiting_approval') {
      pulseGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1
      );
    } else {
      cancelAnimation(pulseGlow);
      pulseGlow.value = withTiming(0, { duration: 300 });
    }
    return () => cancelAnimation(pulseGlow);
  }, [state]);

  // Auto-dismiss for success
  useEffect(() => {
    if (state === 'success' && visible) {
      const timer = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
      return () => clearTimeout(timer);
    }
  }, [state, visible]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => {
    const glowOpacity = interpolate(pulseGlow.value, [0, 1], [0.05, 0.2]);
    return {
      borderColor: `rgba(16, 217, 129, ${glowOpacity})`,
      shadowOpacity: interpolate(pulseGlow.value, [0, 1], [0.1, 0.4]),
    };
  });

  // ── State text ──────────────────────────────────────────────────────────────

  const getTitle = (): string => {
    switch (state) {
      case 'awaiting_approval':
        return 'Menunggu Persetujuan';
      case 'confirming':
        return 'Memproses di Blockchain...';
      case 'success':
        return 'Transaksi Berhasil! 🎉';
      case 'error':
        return 'Transaksi Gagal';
    }
  };

  const getSubtitle = (): string => {
    switch (state) {
      case 'awaiting_approval':
        return 'Mohon setujui di Wallet Anda';
      case 'confirming':
        return `${label} — menunggu konfirmasi jaringan`;
      case 'success':
        return label;
      case 'error':
        return errorMessage ?? 'Terjadi kesalahan. Silakan coba lagi.';
    }
  };

  const getBorderColor = (): string => {
    switch (state) {
      case 'awaiting_approval':
        return Colors.secondary.orange;
      case 'confirming':
        return Colors.secondary.blue;
      case 'success':
        return Colors.accent.primary;
      case 'error':
        return Colors.status.error;
    }
  };

  const getAccentBar = (): string => getBorderColor();

  // ── Render ──────────────────────────────────────────────────────────────────

  const handleSolscanPress = () => {
    if (signature) {
      Linking.openURL(getSolscanTxUrl(signature));
    }
  };

  const renderIcon = () => {
    switch (state) {
      case 'awaiting_approval':
        return <SpinnerIcon />;
      case 'confirming':
        return <BlockchainDots />;
      case 'success':
        return <CheckmarkIcon />;
      case 'error':
        return <ErrorIcon />;
    }
  };

  if (!visible && translateY.value <= -119) return null;

  return (
    <Animated.View style={[styles.outerContainer, containerStyle]}>
      <Animated.View style={[styles.toast, { borderLeftColor: getAccentBar() }, glowStyle]}>
        {/* Accent bar */}
        <View style={[styles.accentBar, { backgroundColor: getAccentBar() }]} />

        <View style={styles.content}>
          {/* Icon */}
          <View style={styles.iconWrapper}>{renderIcon()}</View>

          {/* Text */}
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {getTitle()}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {getSubtitle()}
            </Text>

            {/* Solscan link on success */}
            {state === 'success' && signature && (
              <TouchableOpacity
                onPress={handleSolscanPress}
                style={styles.solscanButton}
                activeOpacity={0.7}
              >
                <Text style={styles.solscanText}>Lihat di Solscan ↗</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Dismiss button */}
          {(state === 'success' || state === 'error') && (
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.dismissButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.dismissText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Progress bar for confirming */}
        {state === 'confirming' && <ProgressBar />}
      </Animated.View>
    </Animated.View>
  );
}

/** Indeterminate progress bar */
function ProgressBar() {
  const position = useSharedValue(-1);

  useEffect(() => {
    position.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(position);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(position.value, [-1, 1], [-TOAST_WIDTH, TOAST_WIDTH * 0.3]) },
    ],
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, animStyle]} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border.medium,
    borderLeftWidth: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    shadowOpacity: 0.3,
    elevation: 12,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingLeft: 12,
    gap: 12,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: Colors.border.light,
    borderTopColor: Colors.secondary.orange,
  },
  successCircle: {
    backgroundColor: 'rgba(16, 217, 129, 0.15)',
  },
  checkmark: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  errorCircle: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  errorExclamation: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.status.error,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: 40,
    height: 40,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 2,
    lineHeight: 18,
  },
  solscanButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 217, 129, 0.12)',
  },
  solscanText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent.primary,
    letterSpacing: 0.3,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 14,
    color: Colors.text.muted,
    fontWeight: '600',
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    width: '40%',
    height: '100%',
    backgroundColor: Colors.secondary.blue,
    borderRadius: 2,
  },
});
