/**
 * hooks/useOfflineSync.ts — Offline Sync Engine with Auto-Reconnect Flush
 *
 * Orchestrates the full offline-first sync pipeline:
 *   1. Detect network state via useNetworkStatus
 *   2. When connectivity is restored → auto-flush pending queue
 *   3. Expose pending count + sync status for UI badge
 *   4. Periodic retry for stuck items
 *
 * Usage:
 *   const sync = useOfflineSync();
 *   // sync.pendingCount → number of items waiting
 *   // sync.syncStatus → 'idle' | 'syncing' | 'done' | 'error' | 'offline'
 *   // sync.manualSync() → force retry now
 *
 * Data flow:
 *   Quest completed → QuestContext.addQuest()
 *     ├── Save to SecureStore (always, instant)
 *     ├── cloudSyncService.syncQuestToCloud()
 *     │   ├── Online → upsert to Supabase
 *     │   └── Offline → queue to AsyncStorage
 *     └── useOfflineSync detects reconnect → flushSyncQueue()
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useNetworkStatus, onNetworkChange } from './useNetworkStatus';
import { useWallet } from '../contexts/WalletContext';
import { useQuests } from '../contexts/QuestContext';
import {
  flushSyncQueue,
  getPendingSyncCount,
  type SyncResult,
} from '../services/cloudSyncService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OfflineSyncStatus = 'idle' | 'syncing' | 'done' | 'error' | 'offline';

export interface OfflineSyncState {
  /** Number of quests pending sync */
  pendingCount: number;
  /** Current sync status */
  syncStatus: OfflineSyncStatus;
  /** Last sync result */
  lastResult: SyncResult | null;
  /** Whether device is currently online */
  isOnline: boolean;
  /** Whether a sync is in progress */
  isSyncing: boolean;
  /** Manually trigger a sync */
  manualSync: () => Promise<void>;
  /** Last sync timestamp (unix ms) */
  lastSyncAt: number | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

/** Minimum interval between auto-syncs (prevent spam) */
const MIN_SYNC_INTERVAL_MS = 30_000; // 30 seconds

/** Periodic check interval for pending items */
const PERIODIC_CHECK_MS = 60_000; // 1 minute

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOfflineSync(): OfflineSyncState {
  const { isOnline } = useNetworkStatus();
  const { publicKeyBase58 } = useWallet();
  const { totalEcoPoints, userQuests } = useQuests();

  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatus>('idle');
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const isSyncingRef = useRef(false);
  const lastSyncRef = useRef(0);

  // ── Refresh pending count ───────────────────────────────────────────────

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingSyncCount();
    setPendingCount(count);
    return count;
  }, []);

  // ── Core sync function ──────────────────────────────────────────────────

  const performSync = useCallback(async () => {
    if (!publicKeyBase58 || isSyncingRef.current) return;

    // Rate limit: don't sync too frequently
    const now = Date.now();
    if (now - lastSyncRef.current < MIN_SYNC_INTERVAL_MS) return;

    const pending = await refreshPendingCount();
    if (pending === 0) {
      setSyncStatus('idle');
      return;
    }

    isSyncingRef.current = true;
    setSyncStatus('syncing');
    lastSyncRef.current = now;

    try {
      console.log(`[OfflineSync] Flushing ${pending} pending items...`);

      const result = await flushSyncQueue(
        publicKeyBase58,
        totalEcoPoints,
        userQuests.length,
      );

      setLastResult(result);
      setLastSyncAt(Date.now());

      if (result.success) {
        setSyncStatus('done');
        console.log(`[OfflineSync] ✅ All ${result.synced} items synced`);
      } else {
        setSyncStatus('error');
        console.warn(`[OfflineSync] ⚠️ ${result.failed} items failed:`, result.errors);
      }

      // Refresh count after sync
      await refreshPendingCount();
    } catch (err) {
      console.error('[OfflineSync] Flush error:', err);
      setSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  }, [publicKeyBase58, totalEcoPoints, userQuests.length, refreshPendingCount]);

  // ── Auto-sync when connectivity is restored ─────────────────────────────

  useEffect(() => {
    const unsubscribe = onNetworkChange((online) => {
      if (online) {
        console.log('[OfflineSync] 📡 Connectivity restored — triggering sync');
        performSync();
      } else {
        setSyncStatus('offline');
        console.log('[OfflineSync] 📴 Device went offline');
      }
    });

    return unsubscribe;
  }, [performSync]);

  // ── Update status based on network state ────────────────────────────────

  useEffect(() => {
    if (!isOnline && syncStatus !== 'offline') {
      setSyncStatus('offline');
    }
  }, [isOnline, syncStatus]);

  // ── Initial load + periodic check ──────────────────────────────────────

  useEffect(() => {
    refreshPendingCount();

    const interval = setInterval(async () => {
      const count = await refreshPendingCount();
      // If there are pending items and we're online, try to sync
      if (count > 0 && isOnline) {
        performSync();
      }
    }, PERIODIC_CHECK_MS);

    return () => clearInterval(interval);
  }, [refreshPendingCount, isOnline, performSync]);

  // ── Auto-sync on app foreground ─────────────────────────────────────────

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isOnline) {
        refreshPendingCount().then((count) => {
          if (count > 0) performSync();
        });
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [isOnline, refreshPendingCount, performSync]);

  // ── Manual sync trigger ─────────────────────────────────────────────────

  const manualSync = useCallback(async () => {
    // Reset rate limit for manual sync
    lastSyncRef.current = 0;
    await performSync();
  }, [performSync]);

  return {
    pendingCount,
    syncStatus,
    lastResult,
    isOnline,
    isSyncing: syncStatus === 'syncing',
    manualSync,
    lastSyncAt,
  };
}
