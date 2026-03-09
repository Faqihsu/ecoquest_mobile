// ─────────────────────────────────────────────────────────────────────────────
// Admin Service — Quest Management on Devnet
//
// Uses SPL Memo Program to record quest creation metadata on-chain.
// This is a devnet-compatible approach until the Anchor program adds a
// dedicated createQuest instruction.
//
// Admin wallet is controlled via ADMIN_WALLET constant.
// All transactions signed via real MWA (useMWASign hook).
// ─────────────────────────────────────────────────────────────────────────────

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { ADMIN_WALLET } from '../utils/constants';
import { getConnection } from '../shared/lib/rpcConnection';

// SPL Memo Program ID (mainnet + devnet)
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export interface QuestParams {
  title: string;
  description: string;
  rewardAmount: number;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  questType: 'cleanup' | 'planting' | 'photo' | 'survey';
  durationHours: number;
}

export interface OnChainQuest {
  id: string;
  title: string;
  description: string;
  rewardAmount: number;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  questType: string;
  active: boolean;
  createdAt: number;
  completions: number;
}

/**
 * Verify that the provided public key is the authorized admin wallet.
 */
export function isAdmin(publicKeyBase58: string | null): boolean {
  if (!publicKeyBase58) return false;
  return publicKeyBase58 === ADMIN_WALLET;
}

/**
 * Build a Memo Program instruction with UTF-8 data.
 * SPL Memo program records arbitrary UTF-8 text on-chain.
 */
function buildMemoIx(
  memoText: string,
  signerKey: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signerKey, isSigner: true, isWritable: false }],
    data: Buffer.from(memoText, 'utf-8'),
  });
}

/**
 * Submit a new quest to devnet via SPL Memo Program.
 *
 * Records JSON-encoded quest metadata on-chain. Transaction is signed
 * by the admin wallet via MWA (useMWASign hook).
 *
 * In production: replace with Anchor `createQuest` CPI when program supports it.
 */
export async function createQuest(
  params: QuestParams,
  adminPublicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const connection = await getConnection();

  const questMeta = JSON.stringify({
    action: 'ECOQUEST_CREATE',
    v: 1,
    title: params.title.slice(0, 64),
    desc: params.description.slice(0, 200),
    reward: params.rewardAmount,
    lat: params.latitude,
    lng: params.longitude,
    radius: params.radiusMeters,
    type: params.questType,
    duration: params.durationHours,
    ts: Math.floor(Date.now() / 1000),
    admin: adminPublicKey.toBase58().slice(0, 16),
  });

  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 30_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    buildMemoIx(questMeta, adminPublicKey)
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = adminPublicKey;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  const signedTx = await signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  console.log(`[AdminService] Quest "${params.title}" recorded on-chain. TX: ${signature}`);
  return signature;
}

/**
 * Fetch quests from devnet. In production uses Anchor program account fetching.
 * Here returns the same seed data — replace with getSignaturesForAddress + parse memos.
 */
export async function listQuests(): Promise<OnChainQuest[]> {
  return [
    {
      id: 'quest-1',
      title: 'Progo River Cleanup',
      description: 'Clean up plastic waste along Progo River banks',
      rewardAmount: 500,
      latitude: -7.7956,
      longitude: 110.3695,
      radiusMeters: 500,
      questType: 'cleanup',
      active: true,
      createdAt: Date.now() - 86400000,
      completions: 12,
    },
    {
      id: 'quest-2',
      title: 'Wonogiri Forest Planting',
      description: 'Plant 5 seedlings in the Wonogiri reforestation zone',
      rewardAmount: 800,
      latitude: -8.2065,
      longitude: 111.0378,
      radiusMeters: 1000,
      questType: 'planting',
      active: true,
      createdAt: Date.now() - 172800000,
      completions: 7,
    },
    {
      id: 'quest-3',
      title: 'Nature Reserve Survey',
      description: 'Document wildlife and plant species in the reserve',
      rewardAmount: 350,
      latitude: -7.5596,
      longitude: 110.8246,
      radiusMeters: 750,
      questType: 'survey',
      active: false,
      createdAt: Date.now() - 259200000,
      completions: 3,
    },
  ];
}

/**
 * Toggle quest active status.
 * Records the status change via Memo Program on devnet.
 */
export async function toggleQuestStatus(
  questId: string,
  active: boolean,
  adminPublicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const connection = await getConnection();

  const memo = JSON.stringify({
    action: 'ECOQUEST_TOGGLE',
    questId,
    active,
    ts: Math.floor(Date.now() / 1000),
  });

  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }),
    buildMemoIx(memo, adminPublicKey)
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = adminPublicKey;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  const signedTx = await signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  console.log(`[AdminService] Quest ${questId} → ${active ? 'active' : 'inactive'}. TX: ${signature}`);
  return signature;
}
