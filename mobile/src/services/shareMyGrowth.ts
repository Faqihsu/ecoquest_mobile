/**
 * shareMyGrowth.ts — Share My Growth Service
 *
 * Generates a dynamic share card showing Tree Level + ECO Saved,
 * captures it as an image, and launches native share sheet.
 *
 * Deep link format:
 *   https://ecoquest.app/invite?ref={walletShort}
 *   ecoquest://invite?ref={walletShort}
 */

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// ── Deep Link Builder ─────────────────────────────────────────────────────────

const APP_SCHEME = 'ecoquest';
const WEB_HOST = 'ecoquest.app'; // Landing page / universal link domain
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.cryptoz.ecoquest';
const APP_STORE_URL =
  'https://apps.apple.com/app/ecoquest/id0000000000'; // Replace with real ID

/**
 * Build a shareable deep link that:
 *   1. Opens the app if installed (via ecoquest:// scheme)
 *   2. Falls back to web landing page / store listing
 */
export function buildDeepLink(walletAddress?: string): {
  /** Native deep link (opens app directly) */
  native: string;
  /** Universal link (web fallback + app redirect) */
  universal: string;
  /** Play Store / App Store fallback */
  storeFallback: string;
  /** Smart link for sharing (universal preferred) */
  shareUrl: string;
} {
  const ref = walletAddress ? walletAddress.slice(0, 8) : '';
  const params = ref ? `?ref=${ref}` : '';

  return {
    native: `${APP_SCHEME}://invite${params}`,
    universal: `https://${WEB_HOST}/invite${params}`,
    storeFallback: PLAY_STORE_URL,
    shareUrl: `https://${WEB_HOST}/invite${params}`,
  };
}

// ── Tree Stage Labels ─────────────────────────────────────────────────────────

export interface GrowthStats {
  ecoPoints: number;
  maxPoints: number;
  totalCo2Saved: number; // kg
  questCount: number;
  walletAddress?: string;
}

function getTreeStage(percentage: number): { label: string; emoji: string } {
  if (percentage >= 1.0) return { label: 'Ancient Tree', emoji: '✨' };
  if (percentage >= 0.8) return { label: 'Mature Tree', emoji: '🌴' };
  if (percentage >= 0.6) return { label: 'Young Tree', emoji: '🌲' };
  if (percentage >= 0.4) return { label: 'Sapling', emoji: '🌳' };
  if (percentage >= 0.2) return { label: 'Seedling', emoji: '🌿' };
  return { label: 'Seed', emoji: '🌱' };
}

// ── Share Text Builder ────────────────────────────────────────────────────────

/**
 * Build the share message text with stats + deep link.
 */
export function buildShareMessage(stats: GrowthStats): string {
  const pct = Math.min(stats.ecoPoints / stats.maxPoints, 1);
  const stage = getTreeStage(pct);
  const deepLink = buildDeepLink(stats.walletAddress);

  return [
    `${stage.emoji} My EcoQuest Tree: ${stage.label}!`,
    '',
    `🌿 ECO Points: ${stats.ecoPoints} / ${stats.maxPoints}`,
    `🌍 CO₂ Saved: ${stats.totalCo2Saved.toFixed(1)} kg`,
    `📋 Quests Completed: ${stats.questCount}`,
    `📊 Growth: ${Math.round(pct * 100)}%`,
    '',
    '🌏 Join me in saving the planet with EcoQuest!',
    `👉 ${deepLink.shareUrl}`,
    '',
    '#EcoQuest #Web3ForGood #SolanaGreenDAO',
  ].join('\n');
}

// ── Share via Native Sheet ────────────────────────────────────────────────────

/**
 * Share growth stats with optional captured image.
 *
 * @param stats    - Growth statistics to display
 * @param imageUri - Optional URI of a captured share card image
 *                   (from react-native-view-shot)
 */
export async function shareGrowth(
  stats: GrowthStats,
  imageUri?: string,
): Promise<void> {
  const message = buildShareMessage(stats);

  // Check if sharing is available on this platform
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }

  if (imageUri) {
    // Share with image: copy to a temp location first (Sharing needs a file URI)
    const fileName = `ecoquest-growth-${Date.now()}.png`;
    const destUri = `${FileSystem.cacheDirectory}${fileName}`;

    // If imageUri is already a file, copy it; otherwise it's fine as-is
    if (imageUri.startsWith('file://') || imageUri.startsWith('/')) {
      await FileSystem.copyAsync({ from: imageUri, to: destUri });
    } else {
      // Already in cache or tmp
      await FileSystem.copyAsync({ from: imageUri, to: destUri });
    }

    await Sharing.shareAsync(destUri, {
      mimeType: 'image/png',
      dialogTitle: 'Share My Growth 🌱',
      UTI: 'public.png', // iOS Universal Type Identifier
    });
  } else {
    // Text-only share: write message to a temp text file
    // (expo-sharing requires a file, not plain text)
    const textFile = `${FileSystem.cacheDirectory}ecoquest-share.txt`;
    await FileSystem.writeAsStringAsync(textFile, message);
    await Sharing.shareAsync(textFile, {
      mimeType: 'text/plain',
      dialogTitle: 'Share My Growth 🌱',
    });
  }
}
