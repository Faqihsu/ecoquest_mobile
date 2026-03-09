// ─────────────────────────────────────────────────────────────────────────────
// Governance Service — Real Anchor On-chain Voting (Solana Devnet)
//
// Uses actual IDL discriminators from the EcoQuest Anchor program.
// All transactions signed via MWA (useMWASign hook).
//
// Anchor program PDAs:
//   governance:  ["governance"]
//   proposal:    ["proposal", proposal_index as u64 LE]
//   vote:        ["vote", proposal.key, voter.key]
// ─────────────────────────────────────────────────────────────────────────────

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram,
} from '@solana/web3.js';
import { DISCRIMINATORS, PROGRAM_ADDRESS } from '../shared/idl/ecoquestIdl';
import { getConnection } from '../shared/lib/rpcConnection';

const PROGRAM_ID = new PublicKey(PROGRAM_ADDRESS);
const GOVERNANCE_SEED = Buffer.from('governance');
const PROPOSAL_SEED = Buffer.from('proposal');
const VOTE_SEED = Buffer.from('vote');

// ── PDA Helpers ───────────────────────────────────────────────────────────────

export function deriveGovernancePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GOVERNANCE_SEED], PROGRAM_ID);
}

export function deriveProposalPDA(proposalIndex: bigint): [PublicKey, number] {
  const indexBuf = Buffer.alloc(8);
  indexBuf.writeUInt32LE(Number(proposalIndex & BigInt(0xffffffff)), 0);
  indexBuf.writeUInt32LE(Number(proposalIndex >> BigInt(32)), 4);
  return PublicKey.findProgramAddressSync([PROPOSAL_SEED, indexBuf], PROGRAM_ID);
}

export function deriveVotePDA(proposalKey: PublicKey, voterKey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VOTE_SEED, proposalKey.toBuffer(), voterKey.toBuffer()],
    PROGRAM_ID
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Proposal {
  id: string;
  proposalIndex: number;
  title: string;
  description: string;
  rewardSKR: number;
  yesVotes: number;
  noVotes: number;
  endTimestamp: number;
  status: 'active' | 'passed' | 'rejected' | 'pending';
  authorWallet: string;
  txSignature?: string;
  onChainKey?: string;
}

export interface VoteReceipt {
  proposalId: string;
  direction: boolean;
  txSignature: string;
  timestamp: number;
}

// ── Compute budget helper ─────────────────────────────────────────────────────

function computeBudgetIxs(): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
  ];
}

// ── Fetch Governance State ────────────────────────────────────────────────────

async function getGovernanceState(connection: Connection): Promise<{ totalProposals: number } | null> {
  const [govPDA] = deriveGovernancePDA();
  const info = await connection.getAccountInfo(govPDA);
  if (!info || info.data.length < 8 + 32 + 8 + 1) return null;
  // Layout: discriminator(8) + authority(32) + total_proposals(8) + bump(1)
  const totalProposals = Number(info.data.readBigUInt64LE(8 + 32));
  return { totalProposals };
}

// ── Fetch Proposals from on-chain ────────────────────────────────────────────

/**
 * Fetch all governance proposals from Solana devnet.
 * Reads on-chain governance account to get total count, then fetches each proposal PDA.
 */
export async function fetchProposals(): Promise<Proposal[]> {
  try {
    const connection = await getConnection();
    const govState = await getGovernanceState(connection);

    if (!govState || govState.totalProposals === 0) {
      // Governance not initialized yet — return seed data
      return getSeedProposals();
    }

    const proposals: Proposal[] = [];
    for (let i = 0; i < govState.totalProposals; i++) {
      const [propPDA] = deriveProposalPDA(BigInt(i));
      const info = await connection.getAccountInfo(propPDA);
      if (!info) continue;

      const data = info.data;
      if (data.length < 8 + 32 + 64 + 1 + 256 + 2 + 8 + 8 + 8 + 1 + 8 + 1 + 8) continue;

      let offset = 8; // skip discriminator
      // creator: PublicKey (32)
      const creator = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      // title: [u8; 64]
      const titleRaw = data.slice(offset, offset + 64);
      offset += 64;
      // title_len: u8
      const titleLen = data[offset]; offset += 1;
      // description: [u8; 256]
      const descRaw = data.slice(offset, offset + 256);
      offset += 256;
      // description_len: u16
      const descLen = data.readUInt16LE(offset); offset += 2;
      // quest_reward: u64
      const questReward = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8;
      // yes_votes: u64
      const yesVotes = Number(data.readBigUInt64LE(offset)); offset += 8;
      // no_votes: u64
      const noVotes = Number(data.readBigUInt64LE(offset)); offset += 8;
      // status: u8
      const status = data[offset]; offset += 1;
      // created_at: i64
      const createdAt = Number(data.readBigInt64LE(offset)); offset += 8;
      // proposal_index: u64
      const proposalIdx = Number(data.readBigUInt64LE(offset)); offset += 8;

      const statusMap: Record<number, Proposal['status']> = {
        0: 'active',
        1: 'passed',
        2: 'rejected',
      };

      proposals.push({
        id: `onchain-${proposalIdx}`,
        proposalIndex: proposalIdx,
        title: Buffer.from(titleRaw.slice(0, titleLen)).toString('utf-8'),
        description: Buffer.from(descRaw.slice(0, descLen)).toString('utf-8'),
        rewardSKR: questReward,
        yesVotes: Number(yesVotes),
        noVotes: Number(noVotes),
        endTimestamp: createdAt * 1000 + 7 * 86400_000,
        status: statusMap[status] ?? 'active',
        authorWallet: creator.toBase58().slice(0, 12) + '...',
        onChainKey: propPDA.toBase58(),
      });
    }

    return proposals.length > 0 ? proposals : getSeedProposals();
  } catch (err) {
    console.warn('[GovernanceService] fetchProposals error, using seed:', err);
    return getSeedProposals();
  }
}

export async function fetchProposalHistory(): Promise<Proposal[]> {
  return [
    {
      id: 'h1',
      proposalIndex: 0,
      title: 'Implement Plastic Reduction Challenge',
      description: 'Monthly plastic reduction tracking challenge with SKR rewards',
      rewardSKR: 600,
      yesVotes: 2100,
      noVotes: 340,
      endTimestamp: Date.now() - 7 * 86400_000,
      status: 'passed',
      authorWallet: 'MtHn...1kYq',
      txSignature: '5xHna...',
    },
    {
      id: 'h2',
      proposalIndex: 1,
      title: 'Lower Staking Requirements to 50 SKR',
      description: 'Reduce minimum staking requirement from 100 SKR to 50 SKR',
      rewardSKR: 200,
      yesVotes: 890,
      noVotes: 1200,
      endTimestamp: Date.now() - 14 * 86400_000,
      status: 'rejected',
      authorWallet: 'LwR2...8mPx',
      txSignature: '3kYbZ...',
    },
  ];
}

function getSeedProposals(): Proposal[] {
  const now = Date.now();
  return [
    {
      id: '1',
      proposalIndex: 0,
      title: 'Add Tree Planting Quest in Sumatra',
      description: 'Create high-value tree planting quests in Sumatra rainforest zone',
      rewardSKR: 500,
      yesVotes: 1250,
      noVotes: 180,
      endTimestamp: now + 2 * 86400_000,
      status: 'active',
      authorWallet: '4RoEXM...Cnju5',
    },
    {
      id: '2',
      proposalIndex: 1,
      title: 'Increase Ocean Cleanup Rewards',
      description: 'Boost rewards for beach and ocean cleanup quests by 50%',
      rewardSKR: 300,
      yesVotes: 890,
      noVotes: 120,
      endTimestamp: now + 5 * 86400_000,
      status: 'active',
      authorWallet: 'EcoW...aRr9',
    },
    {
      id: '3',
      proposalIndex: 2,
      title: 'Launch Wildlife Photography Quest',
      description: 'New photo documentation quest for endangered species',
      rewardSKR: 400,
      yesVotes: 450,
      noVotes: 95,
      endTimestamp: now + 7 * 86400_000,
      status: 'active',
      authorWallet: 'NtrG...d7Yx',
    },
  ];
}

// ── Cast Vote (REAL on-chain) ─────────────────────────────────────────────────

/**
 * Submit a governance vote on-chain using the vote_on_proposal instruction.
 *
 * Accounts (from IDL):
 *   0. voter        [signer, writable] — pays rent
 *   1. governance                      — PDA ["governance"]
 *   2. proposal     [writable]         — PDA ["proposal", proposalIndex LE u64]
 *   3. vote         [init, writable]   — PDA ["vote", proposal, voter]
 *   4. system_program
 *
 * Args: direction (bool) — 1 byte
 */
export async function castVote(
  proposalId: string,
  proposalIndex: number,
  direction: boolean,
  voterPublicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<VoteReceipt> {
  const connection = await getConnection();

  const [govPDA] = deriveGovernancePDA();
  const [propPDA] = deriveProposalPDA(BigInt(proposalIndex));
  const [votePDA] = deriveVotePDA(propPDA, voterPublicKey);

  // Instruction data: discriminator(8) + direction(1 bool)
  const data = Buffer.alloc(9);
  Buffer.from(DISCRIMINATORS.voteOnProposal).copy(data, 0);
  data[8] = direction ? 1 : 0;

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: voterPublicKey, isSigner: true, isWritable: true },
      { pubkey: govPDA, isSigner: false, isWritable: false },
      { pubkey: propPDA, isSigner: false, isWritable: true },
      { pubkey: votePDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  computeBudgetIxs().forEach((ix) => tx.add(ix));
  tx.add(ix);
  tx.feePayer = voterPublicKey;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  const signedTx = await signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  console.log(`[GovernanceService] Vote ${direction ? 'YES' : 'NO'} on proposal ${proposalIndex}. TX: ${signature}`);
  return {
    proposalId,
    direction,
    txSignature: signature,
    timestamp: Date.now(),
  };
}

// ── Create Proposal (REAL on-chain) ──────────────────────────────────────────

/**
 * Create a governance proposal on-chain.
 *
 * Accounts (from IDL):
 *   0. creator      [signer, writable]
 *   1. governance   [writable]          — PDA ["governance"]
 *   2. proposal     [init, writable]    — PDA ["proposal", totalProposals LE u64]
 *   3. system_program
 *
 * Args: title([u8;64]), title_len(u8), description([u8;256]), description_len(u16), quest_reward(u64)
 */
export async function createProposal(
  title: string,
  description: string,
  rewardSKR: number,
  proposerPublicKey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>
): Promise<string> {
  const connection = await getConnection();

  // Get current proposal count to derive PDA
  const govState = await getGovernanceState(connection);
  const proposalIndex = BigInt(govState?.totalProposals ?? 0);

  const [govPDA] = deriveGovernancePDA();
  const [propPDA] = deriveProposalPDA(proposalIndex);

  // Encode title (max 64 bytes)
  const titleBytes = Buffer.from(title, 'utf-8').slice(0, 64);
  const titleBuf = Buffer.alloc(64, 0);
  titleBytes.copy(titleBuf, 0);

  // Encode description (max 256 bytes)
  const descBytes = Buffer.from(description, 'utf-8').slice(0, 256);
  const descBuf = Buffer.alloc(256, 0);
  descBytes.copy(descBuf, 0);

  // quest_reward in base units (6 decimals)
  const rewardBase = BigInt(Math.floor(rewardSKR * 1e6));

  // Instruction data layout:
  // discriminator(8) + title([u8;64]) + title_len(u8) + description([u8;256]) + description_len(u16 LE) + quest_reward(u64 LE)
  const data = Buffer.alloc(8 + 64 + 1 + 256 + 2 + 8);
  let offset = 0;
  Buffer.from(DISCRIMINATORS.createProposal).copy(data, offset); offset += 8;
  titleBuf.copy(data, offset); offset += 64;
  data[offset] = titleBytes.length; offset += 1;
  descBuf.copy(data, offset); offset += 256;
  data.writeUInt16LE(descBytes.length, offset); offset += 2;
  data.writeUInt32LE(Number(rewardBase & BigInt(0xffffffff)), offset);
  data.writeUInt32LE(Number(rewardBase >> BigInt(32)), offset + 4); offset += 8;

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: proposerPublicKey, isSigner: true, isWritable: true },
      { pubkey: govPDA, isSigner: false, isWritable: true },
      { pubkey: propPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  computeBudgetIxs().forEach((cix) => tx.add(cix));
  tx.add(ix);
  tx.feePayer = proposerPublicKey;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  const signedTx = await signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  console.log(`[GovernanceService] Proposal created. TX: ${signature}`);
  return signature;
}
