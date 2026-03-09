/**
 * shared/config/constants.ts
 * Single source of truth untuk semua konstanta aplikasi
 */
import { PublicKey } from '@solana/web3.js';

// ── Solana Cluster ─────────────────────────────────────────────────────────
// 🔒 HACKATHON: Locked to Devnet — no mainnet option
export const SOLANA_CLUSTER = 'devnet' as const;

// ── Premium RPC Endpoints (priority order) ─────────────────────────────────
export const HELIUS_API_KEY = process.env.EXPO_PUBLIC_HELIUS_API_KEY ?? '';
export const TRITON_API_KEY = process.env.EXPO_PUBLIC_TRITON_API_KEY ?? '';
export const QUICKNODE_API_KEY = process.env.EXPO_PUBLIC_QUICKNODE_API_KEY ?? '';

/** Ordered list of RPC endpoints — first healthy one wins (devnet only) */
export const RPC_ENDPOINTS = [
  HELIUS_API_KEY
    ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : null,
  TRITON_API_KEY
    ? `https://devnet.rpcpool.com/${TRITON_API_KEY}`
    : null,
  QUICKNODE_API_KEY
    ? `https://solana-devnet.quiknode.pro/${QUICKNODE_API_KEY}`
    : null,
  'https://api.devnet.solana.com',
].filter(Boolean) as string[];

/** Helius WebSocket endpoint for real-time program events (devnet) */
export const HELIUS_WS_URL = HELIUS_API_KEY
  ? `wss://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'wss://api.devnet.solana.com';

export const SOLANA_RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? undefined;

// ── Program IDs ────────────────────────────────────────────────────────────
// IMPORTANT: Hardcoded from IDL (target/idl/ecoquest_mobile.json → address).
// Do NOT default to System Program (11111...) — transactions would silently
// be sent to the wrong program and fail with InvalidInstructionData.
export const ECOQUEST_PROGRAM_ID = new PublicKey(
  process.env.EXPO_PUBLIC_PROGRAM_ID ?? '4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5',
);

// ── Token ──────────────────────────────────────────────────────────────────
export const SKR_MINT_ADDRESS = process.env.EXPO_PUBLIC_SKR_MINT ?? '';
export const SKR_DECIMALS = 6;
export const MIN_STAKE_AMOUNT = 100; // 100 SKR

// ── Quest ──────────────────────────────────────────────────────────────────
export const GPS_ACCURACY_THRESHOLD_METERS = 50;
export const QUEST_COMPLETION_RADIUS_METERS = 100;

// ── App ────────────────────────────────────────────────────────────────────
export const APP_NAME = 'EcoQuest';
export const APP_VERSION = '1.0.0';
