// ─────────────────────────────────────────────────────────────────────────────
// Cloud Sync Service — Supabase REST API
//
// Syncs quest data (ECO Points) to Supabase for:
//   1. Cross-device persistence
//   2. Mainnet token conversion readiness
//   3. Leaderboard / analytics
//
// Architecture:
//   Local (encrypted SecureStore) ←→ Cloud (Supabase PostgreSQL)
//   - addQuest → save locally FIRST → queue cloud sync
//   - If offline → queued in AsyncStorage → retry on next app open
//   - Idempotent upserts (quest.id as primary key)
//
// No native deps needed — uses fetch() against Supabase REST API.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL =
  (Constants.expoConfig?.extra?.SUPABASE_URL as string) ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  '';

const SUPABASE_ANON_KEY =
  (Constants.expoConfig?.extra?.SUPABASE_ANON_KEY as string) ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

const SYNC_QUEUE_KEY = '@ecoquest:sync_queue';
const SYNC_TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CloudQuestRecord {
  id: string;
  wallet_address: string;
  title: string;
  category: string;
  eco_reward: number;
  latitude: number | null;
  longitude: number | null;
  completed_at: number; // unix ms
  synced_at: number;    // unix ms
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

interface QueuedSync {
  quest: CloudQuestRecord;
  attempts: number;
  createdAt: number;
}

// ── Supabase REST helpers ────────────────────────────────────────────────────

function isConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function supabaseHeaders(): Record<string, string> {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates', // Upsert mode
  };
}

/**
 * Upsert a single quest record to Supabase.
 * Uses `POST` with `Prefer: resolution=merge-duplicates` for idempotent upserts.
 * The table `eco_quests` must have `id` as primary key.
 */
async function upsertQuest(record: CloudQuestRecord): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/eco_quests`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(record),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase upsert failed (${response.status}): ${text}`);
    }

    console.log(`[CloudSync] Synced quest ${record.id}`);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Upsert the aggregated ECO Points summary for a wallet.
 * Table `eco_points_summary` with columns: wallet_address (PK), total_points, quest_count, last_sync.
 */
async function upsertPointsSummary(
  walletAddress: string,
  totalPoints: number,
  questCount: number,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/eco_points_summary`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        wallet_address: walletAddress,
        total_points: totalPoints,
        quest_count: questCount,
        last_sync: Date.now(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Points summary sync failed (${response.status}): ${text}`);
    }

    console.log(`[CloudSync] Points summary synced: ${walletAddress} → ${totalPoints} ECO`);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Sync Queue (offline support) ─────────────────────────────────────────────

async function loadQueue(): Promise<QueuedSync[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedSync[]): Promise<void> {
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

async function addToQueue(quest: CloudQuestRecord): Promise<void> {
  const queue = await loadQueue();
  // Avoid duplicates
  if (queue.some((q) => q.quest.id === quest.id)) return;
  queue.push({ quest, attempts: 0, createdAt: Date.now() });
  await saveQueue(queue);
  console.log(`[CloudSync] Queued for later: ${quest.id}`);
}

async function removeFromQueue(questId: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((q) => q.quest.id !== questId));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sync a single quest to cloud. If offline or Supabase not configured,
 * the quest is queued for later sync.
 *
 * This is called automatically by QuestContext.addQuest.
 * Local save is NEVER blocked by cloud sync failure.
 */
export async function syncQuestToCloud(
  quest: {
    id: string;
    title: string;
    category: string;
    ecoReward: number;
    latitude: number | null;
    longitude: number | null;
    completedAt: number;
    walletAddress: string;
  },
  totalPoints: number,
  questCount: number,
): Promise<boolean> {
  const record: CloudQuestRecord = {
    id: quest.id,
    wallet_address: quest.walletAddress,
    title: quest.title,
    category: quest.category,
    eco_reward: quest.ecoReward,
    latitude: quest.latitude,
    longitude: quest.longitude,
    completed_at: quest.completedAt,
    synced_at: Date.now(),
  };

  if (!isConfigured()) {
    console.warn('[CloudSync] Supabase not configured — queuing locally');
    await addToQueue(record);
    return false;
  }

  try {
    // Upsert quest + points summary in parallel
    await Promise.all([
      upsertQuest(record),
      upsertPointsSummary(quest.walletAddress, totalPoints, questCount),
    ]);
    // Remove from queue if it was previously queued
    await removeFromQueue(quest.id);
    return true;
  } catch (err) {
    console.warn('[CloudSync] Sync failed, queuing for retry:', err);
    await addToQueue(record);
    return false;
  }
}

/**
 * Flush the pending sync queue. Call on app start or when connectivity is restored.
 * Processes queued quests one-by-one with idempotent upserts.
 *
 * @param totalPoints Current total ECO points for points summary update
 * @param questCount Current total quest count
 * @returns SyncResult with counts and errors
 */
export async function flushSyncQueue(
  walletAddress: string,
  totalPoints: number,
  questCount: number,
): Promise<SyncResult> {
  if (!isConfigured()) {
    return { success: false, synced: 0, failed: 0, errors: ['Supabase not configured'] };
  }

  const queue = await loadQueue();
  if (queue.length === 0) {
    return { success: true, synced: 0, failed: 0, errors: [] };
  }

  console.log(`[CloudSync] Flushing ${queue.length} queued syncs...`);

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of queue) {
    try {
      await upsertQuest(item.quest);
      await removeFromQueue(item.quest.id);
      synced++;
    } catch (err) {
      failed++;
      errors.push(`${item.quest.id}: ${String(err)}`);
      // Update attempt count
      item.attempts++;
    }
  }

  // Update points summary once after all quests synced
  if (synced > 0) {
    try {
      await upsertPointsSummary(walletAddress, totalPoints, questCount);
    } catch {}
  }

  // Save updated queue (with incremented attempt counts for failed items)
  const remaining = await loadQueue();
  if (remaining.length > 0) {
    await saveQueue(remaining.map((q) => ({
      ...q,
      // Drop items with > 10 attempts (stale)
    })).filter((q) => q.attempts <= 10));
  }

  console.log(`[CloudSync] Flush complete: ${synced} synced, ${failed} failed`);
  return { success: failed === 0, synced, failed, errors };
}

/**
 * Get count of pending (unsynced) quests in the queue.
 */
export async function getPendingSyncCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

/**
 * Fetch ECO points from cloud for a wallet (for cross-device restore).
 * Returns null if not configured or fetch fails.
 */
export async function fetchCloudPoints(
  walletAddress: string,
): Promise<{ totalPoints: number; questCount: number } | null> {
  if (!isConfigured()) return null;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/eco_points_summary?wallet_address=eq.${walletAddress}&select=total_points,quest_count`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } },
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.length === 0) return null;

    return {
      totalPoints: data[0].total_points ?? 0,
      questCount: data[0].quest_count ?? 0,
    };
  } catch {
    return null;
  }
}
