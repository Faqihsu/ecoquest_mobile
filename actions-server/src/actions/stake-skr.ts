/**
 * Solana Action: Stake SKR
 *
 * GET  → ActionGetResponse — Blink card metadata (tree image, APY, stake options)
 * POST → ActionPostResponse — Build unsigned staking transaction for user to sign
 *
 * Blink rendering on X/Twitter:
 *   ┌───────────────────────────────────────────┐
 *   │  🌳  [Tree Image — dynamic based on pool] │
 *   │                                           │
 *   │  Stake SKR on EcoQuest 🌿                 │
 *   │  Current APY: 20% · Earn eco rewards      │
 *   │                                           │
 *   │  [100 SKR] [500 SKR] [1000 SKR] [Custom]  │
 *   │                                           │
 *   │       [ 🌱 Stake Now — Free Gas ]          │
 *   └───────────────────────────────────────────┘
 */

import { Request, Response } from 'express';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  clusterApiUrl,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

// ── Program Constants (mirror mobile app) ─────────────────────────────────────

const ECOQUEST_PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || '4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5',
);

const SKR_MINT = new PublicKey(
  process.env.SKR_MINT || '11111111111111111111111111111111', // Replace with real mint
);

const SKR_DECIMALS = 6;
const STAKING_APY = 20; // 20% APY

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');

// ── Anchor IDL Discriminators ─────────────────────────────────────────────────

// SHA256("global:stake_skr")[0..8]
const STAKE_DISCRIMINATOR = Buffer.from([
  0x4a, 0xcf, 0x5c, 0xca, 0x4e, 0x78, 0x12, 0x66,
]);

// ── PDA Derivation ────────────────────────────────────────────────────────────

function deriveStakingPDAs(userPublicKey: PublicKey) {
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('stake_pool')],
    ECOQUEST_PROGRAM_ID,
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('stake_vault')],
    ECOQUEST_PROGRAM_ID,
  );
  const [stakerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('staker'), userPublicKey.toBuffer()],
    ECOQUEST_PROGRAM_ID,
  );
  return { poolPda, vaultPda, stakerPda };
}

// ── U64 LE writer (no BigInt requirement) ─────────────────────────────────────

function writeUInt64LE(buf: Buffer, value: bigint, offset: number): void {
  const lo = Number(value & BigInt(0xffffffff));
  const hi = Number((value >> BigInt(32)) & BigInt(0xffffffff));
  buf.writeUInt32LE(lo, offset);
  buf.writeUInt32LE(hi, offset + 4);
}

// ── Action Types ──────────────────────────────────────────────────────────────

interface ActionGetResponse {
  type: 'action';
  icon: string;
  title: string;
  description: string;
  label: string;
  links: {
    actions: ActionLink[];
  };
}

interface ActionLink {
  label: string;
  href: string;
  parameters?: ActionParameter[];
}

interface ActionParameter {
  name: string;
  label: string;
  required: boolean;
  type?: string;
  min?: number;
  max?: number;
}

interface ActionPostResponse {
  type: 'transaction';
  transaction: string; // Base64 encoded transaction
  message?: string;
}

// ── GET Handler — ActionGetResponse ───────────────────────────────────────────

async function handleGet(_req: Request, res: Response): Promise<void> {
  const baseUrl = `${_req.protocol}://${_req.get('host')}`;

  const response: ActionGetResponse = {
    type: 'action',
    icon: 'https://raw.githubusercontent.com/cryptoz-app/ecoquest-assets/main/staking-tree.png',
    title: '🌿 Stake SKR on EcoQuest',
    description: [
      `Current APY: ${STAKING_APY}% 📈`,
      '',
      'Stake your SKR tokens to earn passive eco-rewards.',
      'Your staking powers the Green DAO and grows your virtual tree! 🌳',
      '',
      'Powered by Solana · Gas fees sponsored for new users ⚡',
    ].join('\n'),
    label: '🌱 Stake SKR',
    links: {
      actions: [
        // Quick-stake preset amounts
        {
          label: '🌱 Stake 100 SKR',
          href: `${baseUrl}/api/actions/stake-skr?amount=100`,
        },
        {
          label: '🌿 Stake 500 SKR',
          href: `${baseUrl}/api/actions/stake-skr?amount=500`,
        },
        {
          label: '🌳 Stake 1,000 SKR',
          href: `${baseUrl}/api/actions/stake-skr?amount=1000`,
        },
        // Custom amount input
        {
          label: '💎 Stake Custom Amount',
          href: `${baseUrl}/api/actions/stake-skr?amount={amount}`,
          parameters: [
            {
              name: 'amount',
              label: 'Amount of SKR to stake',
              required: true,
              type: 'number',
              min: 100,
              max: 1_000_000,
            },
          ],
        },
      ],
    },
  };

  res.status(200).json(response);
}

// ── POST Handler — ActionPostResponse ─────────────────────────────────────────

async function handlePost(req: Request, res: Response): Promise<void> {
  try {
    // ── 1. Parse inputs ──────────────────────────────────────────────────
    const { account } = req.body;
    if (!account) {
      res.status(400).json({ error: 'Missing "account" in request body' });
      return;
    }

    let userPublicKey: PublicKey;
    try {
      userPublicKey = new PublicKey(account);
    } catch {
      res.status(400).json({ error: 'Invalid Solana public key' });
      return;
    }

    const amountStr = req.query.amount as string;
    const amount = parseFloat(amountStr || '100');
    if (isNaN(amount) || amount < 100) {
      res.status(400).json({ error: 'Amount must be at least 100 SKR' });
      return;
    }

    // ── 2. Derive PDAs ───────────────────────────────────────────────────
    const pdas = deriveStakingPDAs(userPublicKey);

    // ── 3. Derive user's SKR token account ───────────────────────────────
    const userTokenAccount = await getAssociatedTokenAddress(
      SKR_MINT,
      userPublicKey,
    );

    // ── 4. Build stake instruction ───────────────────────────────────────
    const amountLamports = BigInt(Math.floor(amount * 10 ** SKR_DECIMALS));

    const data = Buffer.alloc(16);
    STAKE_DISCRIMINATOR.copy(data, 0);
    writeUInt64LE(data, amountLamports, 8);

    const stakeIx = new TransactionInstruction({
      programId: ECOQUEST_PROGRAM_ID,
      keys: [
        { pubkey: userPublicKey, isSigner: true, isWritable: true },
        { pubkey: pdas.poolPda, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: pdas.vaultPda, isSigner: false, isWritable: true },
        { pubkey: pdas.stakerPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });

    // ── 5. Build transaction ─────────────────────────────────────────────
    const connection = new Connection(RPC_URL, 'confirmed');
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');

    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = userPublicKey;

    // Priority fee for faster landing
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    );

    tx.add(stakeIx);

    // ── 6. Serialize and return ──────────────────────────────────────────
    const serializedTx = tx
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    const response: ActionPostResponse = {
      type: 'transaction',
      transaction: serializedTx,
      message: `Staking ${amount} SKR on EcoQuest 🌿 | APY: ${STAKING_APY}%`,
    };

    res.status(200).json(response);
  } catch (err: any) {
    console.error('[Actions] POST /stake-skr error:', err);
    res.status(500).json({
      error: `Failed to create staking transaction: ${err?.message || 'Unknown error'}`,
    });
  }
}

// ── Export ─────────────────────────────────────────────────────────────────────

export const stakeSkrAction = {
  get: handleGet,
  post: handlePost,
};
