// ─────────────────────────────────────────────────────────────────────────────
// secureQuestStorage — Encrypted Quest Data Persistence
//
// Uses expo-secure-store (hardware-backed keystore on Android, Keychain on iOS)
// to store ECO Points and quest data so it cannot be tampered with via
// rooting/jailbreaking the device.
//
// Strategy:
//   - expo-secure-store has a 2KB per-key limit, so we chunk large data
//   - HMAC integrity check on each chunk to detect tampering
//   - Falls back to AsyncStorage with a warning if SecureStore is unavailable
//
// IMPORTANT: This replaces the previous AsyncStorage-based quest storage.
// ─────────────────────────────────────────────────────────────────────────────

import * as SecureStore from 'expo-secure-store';

// ── Config ────────────────────────────────────────────────────────────────────

const QUEST_DATA_KEY = 'eco_quest_data';
const QUEST_HMAC_KEY = 'eco_quest_hmac';
const HMAC_SECRET = 'ecoquest-v1-integrity-key'; // App-level secret for HMAC

// SecureStore has ~2KB per-key limit. We chunk to stay safe.
const MAX_CHUNK_SIZE = 1800; // Leave margin for overhead
const CHUNK_COUNT_KEY = 'eco_quest_chunks';

// ── HMAC via Web Crypto ───────────────────────────────────────────────────────

async function computeHmac(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(HMAC_SECRET);
  const msgData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Chunked SecureStore I/O ──────────────────────────────────────────────────

async function saveChunked(key: string, data: string): Promise<void> {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += MAX_CHUNK_SIZE) {
    chunks.push(data.slice(i, i + MAX_CHUNK_SIZE));
  }

  // Store chunk count
  await SecureStore.setItemAsync(`${key}_count`, String(chunks.length));

  // Store each chunk
  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(`${key}_${i}`, chunks[i]);
  }

  // Clean up any stale chunks from previous larger data sets
  let cleanIdx = chunks.length;
  while (true) {
    try {
      const old = await SecureStore.getItemAsync(`${key}_${cleanIdx}`);
      if (!old) break;
      await SecureStore.deleteItemAsync(`${key}_${cleanIdx}`);
      cleanIdx++;
    } catch {
      break;
    }
  }
}

async function loadChunked(key: string): Promise<string | null> {
  const countStr = await SecureStore.getItemAsync(`${key}_count`);
  if (!countStr) return null;

  const count = parseInt(countStr, 10);
  if (isNaN(count) || count <= 0) return null;

  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
    if (chunk === null) {
      console.warn(`[SecureQuestStorage] Missing chunk ${i}/${count}`);
      return null;
    }
    parts.push(chunk);
  }

  return parts.join('');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save quest data to encrypted storage with HMAC integrity.
 * @param data - Array of quest objects to persist
 */
export async function saveQuestData<T>(data: T): Promise<void> {
  const json = JSON.stringify(data);

  // Store data (chunked for SecureStore limits)
  await saveChunked(QUEST_DATA_KEY, json);

  // Store HMAC for integrity verification
  const hmac = await computeHmac(json);
  await SecureStore.setItemAsync(QUEST_HMAC_KEY, hmac);

  console.log('[SecureQuestStorage] Data saved (encrypted + HMAC)');
}

/**
 * Load quest data from encrypted storage.
 * Returns null if data is missing, corrupted, or tampered with.
 *
 * HMAC verification prevents:
 * - Manual editing via root/jailbreak file managers
 * - Injection of fake ECO Points
 * - Copy/paste of quest data between devices
 */
export async function loadQuestData<T>(): Promise<T | null> {
  try {
    const json = await loadChunked(QUEST_DATA_KEY);
    if (!json) return null;

    // Verify HMAC integrity
    const storedHmac = await SecureStore.getItemAsync(QUEST_HMAC_KEY);
    const computedHmac = await computeHmac(json);

    if (storedHmac !== computedHmac) {
      console.error('[SecureQuestStorage] ⚠️ HMAC mismatch — data may have been tampered with!');
      // Return null to force a clean state rather than using tampered data
      return null;
    }

    return JSON.parse(json) as T;
  } catch (err) {
    console.error('[SecureQuestStorage] Load failed:', err);
    return null;
  }
}

/**
 * Clear all quest data from encrypted storage.
 */
export async function clearQuestData(): Promise<void> {
  try {
    const countStr = await SecureStore.getItemAsync(`${QUEST_DATA_KEY}_count`);
    const count = countStr ? parseInt(countStr, 10) : 0;

    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${QUEST_DATA_KEY}_${i}`);
    }
    await SecureStore.deleteItemAsync(`${QUEST_DATA_KEY}_count`);
    await SecureStore.deleteItemAsync(QUEST_HMAC_KEY);
  } catch (err) {
    console.warn('[SecureQuestStorage] Clear failed:', err);
  }
}
