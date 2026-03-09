/**
 * components/PendingSyncBadge.tsx — Offline Sync Status Indicator
 *
 * Floating badge that shows:
 *   - 📴 Offline indicator when no connectivity
 *   - ⏳ Pending sync count when items are queued
 *   - ✅ Brief success flash when sync completes
 *   - Tap to manually trigger sync retry
 *
 * Premium glassmorphic design with subtle pulse animation.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useOfflineSync, type OfflineSyncStatus } from '../hooks/useOfflineSync';

// ── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OfflineSyncStatus, {
  icon: string;
  label: string;
  color: string;
  bg: string;
}> = {
  idle:    { icon: '✅', label: 'All synced',        color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  syncing: { icon: '⏳', label: 'Syncing...',        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  done:    { icon: '✅', label: 'Sync complete',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  error:   { icon: '⚠️', label: 'Sync failed',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  offline: { icon: '📴', label: 'Offline',           color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PendingSyncBadge() {
  const {
    pendingCount,
    syncStatus,
    isOnline,
    isSyncing,
    manualSync,
  } = useOfflineSync();

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when syncing or offline
  useEffect(() => {
    if (syncStatus === 'syncing' || syncStatus === 'offline') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [syncStatus, pulseAnim]);

  // Don't show badge when everything is synced and online
  if (syncStatus === 'idle' && pendingCount === 0 && isOnline) return null;
  // Hide "done" after a brief flash
  if (syncStatus === 'done' && pendingCount === 0) {
    // Show briefly then auto-hide (handled by parent re-render after timeout)
    return null;
  }

  const config = STATUS_CONFIG[syncStatus];

  return (
    <Animated.View style={{ opacity: pulseAnim }}>
      <TouchableOpacity
        style={[styles.badge, { backgroundColor: config.bg, borderColor: config.color }]}
        onPress={manualSync}
        activeOpacity={0.7}
        disabled={isSyncing}
      >
        <Text style={styles.icon}>{config.icon}</Text>
        <View style={styles.textContainer}>
          <Text style={[styles.label, { color: config.color }]}>
            {syncStatus === 'offline' && pendingCount > 0
              ? `Offline · ${pendingCount} pending`
              : syncStatus === 'syncing'
                ? `Syncing ${pendingCount} item${pendingCount !== 1 ? 's' : ''}...`
                : syncStatus === 'error'
                  ? `Sync failed · Tap to retry`
                  : pendingCount > 0
                    ? `${pendingCount} pending`
                    : config.label}
          </Text>
          {!isOnline && (
            <Text style={styles.sublabel}>Data aman tersimpan lokal</Text>
          )}
        </View>
        {pendingCount > 0 && syncStatus !== 'syncing' && (
          <View style={[styles.countBadge, { backgroundColor: config.color }]}>
            <Text style={styles.countText}>{pendingCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  icon: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  sublabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  countBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#030712',
  },
});
