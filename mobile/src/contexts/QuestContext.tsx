/**
 * QuestContext.tsx
 *
 * Hybrid Storage for ECO Points:
 * - LOCAL: EncryptedStorage (expo-secure-store) with HMAC integrity
 * - CLOUD: Auto-sync to Supabase PostgreSQL for cross-device persistence
 *          and mainnet token conversion readiness
 *
 * Local save is NEVER blocked by cloud sync failure.
 * Offline syncs are queued and retried on next app open.
 */

import React, { createContext, useContext, useCallback, useState, useEffect } from "react";
import { saveQuestData, loadQuestData } from "../shared/lib/secureQuestStorage";
import {
  syncQuestToCloud,
  flushSyncQueue,
  getPendingSyncCount,
} from "../services/cloudSyncService";
import * as Location from "expo-location";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestCategory = "Pantai" | "Hutan" | "Sungai" | "Kota" | "Lainnya";

export const ECO_REWARDS: Record<QuestCategory, number> = {
  Pantai:  80,
  Hutan:   100,
  Sungai:  90,
  Kota:    60,
  Lainnya: 50,
};

export const CATEGORY_ICONS: Record<QuestCategory, string> = {
  Pantai:  "🏖️",
  Hutan:   "🌳",
  Sungai:  "🌊",
  Kota:    "♻️",
  Lainnya: "🌿",
};

export interface UserQuest {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  ecoReward: number;
  proofPhotoUri: string;     // local file URI from live camera capture
  latitude: number | null;
  longitude: number | null;
  completedAt: number;       // unix ms
  walletAddress: string;
}

// ── Context ───────────────────────────────────────────────────────────────────

interface QuestContextState {
  userQuests: UserQuest[];
  isLoading: boolean;
  totalEcoPoints: number;
  /** Number of quests pending cloud sync (offline) */
  pendingSyncCount: number;
  /** Cloud sync status for UI feedback */
  syncStatus: 'idle' | 'syncing' | 'done' | 'error';
  /** Daily cooldown: can user create a quest right now? */
  canCreateQuest: boolean;
  /** Friendly message when cooldown is active (null = eligible) */
  cooldownMessage: string | null;
  addQuest: (quest: Omit<UserQuest, "id" | "completedAt">) => Promise<UserQuest>;
  deleteQuest: (id: string) => Promise<void>;
  getQuestById: (id: string) => UserQuest | undefined;
  refresh: () => Promise<void>;
  /** Manually trigger a sync of pending offline quests */
  retrySync: () => Promise<void>;
}

const QuestContext = createContext<QuestContextState | undefined>(undefined);

// ── Daily Cooldown Helper ─────────────────────────────────────────────────

/**
 * Check if the user is eligible to create a quest today.
 * Returns { eligible, message }.
 * Compares calendar dates (resets at midnight local time).
 */
function checkQuestEligibility(quests: UserQuest[]): { eligible: boolean; message: string | null } {
  if (quests.length === 0) return { eligible: true, message: null };

  // Find the most recent quest
  const latest = quests.reduce((a, b) => (a.completedAt > b.completedAt ? a : b));
  const lastDate = new Date(latest.completedAt);
  const today = new Date();

  // Compare calendar dates (year + month + day)
  const sameDay =
    lastDate.getFullYear() === today.getFullYear() &&
    lastDate.getMonth() === today.getMonth() &&
    lastDate.getDate() === today.getDate();

  if (sameDay) {
    return {
      eligible: false,
      message: "🌍 Kamu sudah berkontribusi hari ini! Kembali lagi besok untuk menjaga bumi. 💚",
    };
  }

  return { eligible: true, message: null };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function QuestProvider({ children, walletAddress }: {
  children: React.ReactNode;
  walletAddress?: string | null;
}) {
  const [userQuests, setUserQuests] = useState<UserQuest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<QuestContextState['syncStatus']>('idle');

  // ── Load local data ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const data = await loadQuestData<UserQuest[]>();
      setUserQuests(data ?? []);
    } catch {
      setUserQuests([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Flush pending cloud syncs on mount ─────────────────────────────────
  useEffect(() => {
    if (!walletAddress) return;

    (async () => {
      const pending = await getPendingSyncCount();
      setPendingSyncCount(pending);

      if (pending > 0) {
        console.log(`[QuestContext] Flushing ${pending} pending cloud syncs...`);
        setSyncStatus('syncing');
        const totalPoints = userQuests.reduce((acc, q) => acc + q.ecoReward, 0);
        const result = await flushSyncQueue(walletAddress, totalPoints, userQuests.length);
        setSyncStatus(result.success ? 'done' : 'error');
        setPendingSyncCount(result.failed);
      }
    })();
  }, [walletAddress]); // Only on mount / wallet change

  // ── Local encrypted save ────────────────────────────────────────────────
  const save = useCallback(async (quests: UserQuest[]) => {
    await saveQuestData(quests);
    setUserQuests(quests);
  }, []);

  // ── Add quest: local save FIRST, then cloud sync (non-blocking) ────────
  const addQuest = useCallback(async (data: Omit<UserQuest, "id" | "completedAt">) => {
    const quest: UserQuest = {
      ...data,
      id: `uq-${Date.now()}`,
      completedAt: Date.now(),
    };
    try {
      const next = [quest, ...userQuests];
      // 1. Save locally (encrypted) — this MUST succeed
      await save(next);

      // 2. Sync to cloud (fire-and-forget) — never blocks local save
      const totalPoints = next.reduce((acc, q) => acc + q.ecoReward, 0);
      syncQuestToCloud(quest, totalPoints, next.length)
        .then((synced) => {
          if (synced) {
            setPendingSyncCount((c) => Math.max(0, c - 1));
          } else {
            setPendingSyncCount((c) => c + 1);
          }
        })
        .catch(() => {
          setPendingSyncCount((c) => c + 1);
        });

      return quest;
    } catch (err: any) {
      throw new Error(err?.message ?? "Gagal menyimpan quest.");
    }
  }, [userQuests, save]);

  const deleteQuest = useCallback(async (id: string) => {
    try {
      const next = userQuests.filter((q) => q.id !== id);
      await save(next);
    } catch (err: any) {
      throw new Error(err?.message ?? "Gagal menghapus quest.");
    }
  }, [userQuests, save]);

  const getQuestById = useCallback(
    (id: string) => userQuests.find((q) => q.id === id),
    [userQuests]
  );

  // ── Manual retry sync ─────────────────────────────────────────────────
  const retrySync = useCallback(async () => {
    if (!walletAddress) return;
    setSyncStatus('syncing');
    const totalPoints = userQuests.reduce((acc, q) => acc + q.ecoReward, 0);
    const result = await flushSyncQueue(walletAddress, totalPoints, userQuests.length);
    setSyncStatus(result.success ? 'done' : 'error');
    setPendingSyncCount(result.failed);
  }, [walletAddress, userQuests]);

  const totalEcoPoints = userQuests.reduce((acc, q) => acc + q.ecoReward, 0);

  // ── Daily cooldown check ─────────────────────────────────────────────────
  const { eligible: canCreateQuest, message: cooldownMessage } = checkQuestEligibility(userQuests);

  return (
    <QuestContext.Provider value={{
      userQuests,
      isLoading,
      totalEcoPoints,
      pendingSyncCount,
      syncStatus,
      canCreateQuest,
      cooldownMessage,
      addQuest,
      deleteQuest,
      getQuestById,
      refresh: load,
      retrySync,
    }}>
      {children}
    </QuestContext.Provider>
  );
}

export function useQuests() {
  const ctx = useContext(QuestContext);
  if (!ctx) throw new Error("useQuests must be used inside QuestProvider");
  return ctx;
}

// Keep backward-compat exports (other screens may import these)
export type QuestCompletion = { questId: string; completedAt: number; photoUrl: string };
