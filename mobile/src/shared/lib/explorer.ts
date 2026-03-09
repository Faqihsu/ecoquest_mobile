// ─────────────────────────────────────────────────────────────────────────────
// Solscan Explorer URL Helper
// ─────────────────────────────────────────────────────────────────────────────

import { SOLANA_CLUSTER } from '../config/constants';

/**
 * Generate a Solscan URL for a given transaction signature.
 *
 * @example
 * getSolscanTxUrl('5abc...xyz') → 'https://solscan.io/tx/5abc...xyz?cluster=devnet'
 */
export function getSolscanTxUrl(signature: string): string {
  // 🔒 HACKATHON: Always devnet
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}
