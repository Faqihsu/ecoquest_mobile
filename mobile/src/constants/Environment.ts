/**
 * constants/Environment.ts
 *
 * 🔒 HACKATHON: Single source of truth untuk seluruh environment configuration.
 * Semua fitur (Quest, Staking, Balance, Swap) HARUS import dari sini.
 *
 * Cluster: DEVNET ONLY — tidak ada opsi mainnet untuk menghindari kebingungan juri.
 */

import { PublicKey, clusterApiUrl } from '@solana/web3.js';

// ── Cluster ───────────────────────────────────────────────────────────────────

/** Solana cluster — hardcoded Devnet for hackathon */
export const SOLANA_CLUSTER = 'devnet' as const;
export type SolanaCluster = typeof SOLANA_CLUSTER;

// ── RPC Endpoints ─────────────────────────────────────────────────────────────

const HELIUS_API_KEY = process.env.EXPO_PUBLIC_HELIUS_API_KEY ?? '';

/** Primary RPC endpoint (Helius devnet if key exists, else public devnet) */
export const RPC_ENDPOINT = HELIUS_API_KEY
  ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : clusterApiUrl('devnet');

/** WebSocket endpoint for real-time subscriptions */
export const WS_ENDPOINT = HELIUS_API_KEY
  ? `wss://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'wss://api.devnet.solana.com';

/** Public fallback RPC (rate-limited but always available) */
export const FALLBACK_RPC = 'https://api.devnet.solana.com';

// ── Program & Token ───────────────────────────────────────────────────────────

/** EcoQuest Anchor Program ID (deployed on devnet) */
export const PROGRAM_ID = new PublicKey(
  process.env.EXPO_PUBLIC_PROGRAM_ID ?? '4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5',
);

/** SKR Token Mint (devnet) */
export const SKR_MINT = process.env.EXPO_PUBLIC_SKR_MINT ?? '2BcXV1FfbTpVGRi6h3ehxjPSHS1fyJDMmrw6DwDKU4ep';

/** SKR token decimals */
export const SKR_DECIMALS = 6;

// ── Admin ─────────────────────────────────────────────────────────────────────

/** Admin wallet (for governance / quest approval) */
export const ADMIN_WALLET = process.env.EXPO_PUBLIC_ADMIN_WALLET ?? 'FVKMmRwKW2HJmFehFqF5LsQQAMjgJW4ywnbD8e6uVEGY';

// ── MWA Config ────────────────────────────────────────────────────────────────

/** Mobile Wallet Adapter identity — shown in wallet UI */
export const MWA_APP_IDENTITY = {
  name: 'EcoQuest',
  uri: 'https://ecoquest.app',
  icon: 'assets/icon.png',
} as const;

/** MWA cluster — always devnet */
export const MWA_CLUSTER = SOLANA_CLUSTER;

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Minimum SOL balance before showing airdrop button (for hackathon judges) */
export const MIN_SOL_FOR_TX = 0.02;

/** Amount of SOL to airdrop (1 SOL) */
export const AIRDROP_AMOUNT_SOL = 1;

/** Minimum stake amount in SKR */
export const MIN_STAKE_SKR = 100;

// ── App Info ──────────────────────────────────────────────────────────────────

export const APP_NAME = 'EcoQuest';
export const APP_VERSION = '1.0.0';
export const IS_DEVNET = true; // Always true for hackathon build
