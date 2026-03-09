#!/usr/bin/env ts-node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/check-devnet.ts
//
// Cek status semua PDAs EcoQuest di Solana Devnet.
// Tampilkan: ada/tidak, balance lamports, dan data summary.
//
// Jalankan:
//   npx ts-node scripts/check-devnet.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PROGRAM_ID   = new PublicKey('4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5');
const RPC_ENDPOINT = 'https://api.devnet.solana.com';

function deriveQuestProgramPDA() { return PublicKey.findProgramAddressSync([Buffer.from('quest_program')], PROGRAM_ID); }
function deriveStakePoolPDA()    { return PublicKey.findProgramAddressSync([Buffer.from('stake_pool')],    PROGRAM_ID); }
function deriveVaultPDA(pool: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from('stake_vault'), pool.toBuffer()], PROGRAM_ID); }
function deriveGovernancePDA()   { return PublicKey.findProgramAddressSync([Buffer.from('governance')],    PROGRAM_ID); }
function deriveArenaPDA()        { return PublicKey.findProgramAddressSync([Buffer.from('pvp_arena')],    PROGRAM_ID); }
function deriveStakerPDA(user: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from('staker'), user.toBuffer()], PROGRAM_ID); }

function loadAdminKey(): PublicKey {
  const walletPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), '.config', 'solana', 'id.json');
  if (!fs.existsSync(walletPath)) return PublicKey.default;
  const raw = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const { Keypair } = require('@solana/web3.js');
  return Keypair.fromSecretKey(Uint8Array.from(raw)).publicKey;
}

function readU64LE(data: Buffer, offset: number): bigint {
  const lo = data.readUInt32LE(offset);
  const hi = data.readUInt32LE(offset + 4);
  return BigInt(lo) | (BigInt(hi) << BigInt(32));
}

async function checkPDA(
  connection: Connection,
  name: string,
  pda: PublicKey,
  parseData?: (data: Buffer) => string
) {
  const info = await connection.getAccountInfo(pda);
  const status = info ? '✅' : '❌';
  const lamports = info ? `${(info.lamports / LAMPORTS_PER_SOL * 1000).toFixed(2)} mSOL` : '-';
  const detail = info && parseData ? parseData(Buffer.from(info.data)) : '';
  console.log(`  ${status} ${name.padEnd(20)} ${pda.toBase58().slice(0, 20)}...  [${lamports}] ${detail}`);
}

async function main() {
  console.log('\n🌿 EcoQuest Devnet Status Check');
  console.log('════════════════════════════════════════\n');

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const adminKey   = loadAdminKey();

  console.log(`👛 Admin Wallet: ${adminKey.toBase58()}`);
  const balance = await connection.getBalance(adminKey);
  console.log(`💰 Balance     : ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  const [questProgramPDA] = deriveQuestProgramPDA();
  const [poolPDA]         = deriveStakePoolPDA();
  const [vaultPDA]        = deriveVaultPDA(poolPDA);
  const [govPDA]          = deriveGovernancePDA();
  const [arenaPDA]        = deriveArenaPDA();
  const [stakerPDA]       = deriveStakerPDA(adminKey);

  console.log('📋 PDA Status:\n');

  await checkPDA(connection, 'QuestProgram', questProgramPDA, (d) =>
    d.length >= 8 + 32 + 8 + 1
      ? `total_quests=${readU64LE(d, 8 + 32)}`
      : ''
  );

  await checkPDA(connection, 'StakePool', poolPDA, (d) =>
    d.length >= 8 + 32 + 32 + 4 + 8 + 1 + 1
      ? `apy=${d.readUInt32LE(8 + 32 + 32) / 100}% tvl=${readU64LE(d, 8 + 32 + 32 + 4)}`
      : ''
  );

  await checkPDA(connection, 'StakeVault', vaultPDA);

  await checkPDA(connection, 'Governance', govPDA, (d) =>
    d.length >= 8 + 32 + 8 + 1
      ? `total_proposals=${readU64LE(d, 8 + 32)}`
      : ''
  );

  await checkPDA(connection, 'Arena (PvP)', arenaPDA, (d) =>
    d.length >= 8 + 32 + 8 + 1
      ? `total_duels=${readU64LE(d, 8 + 32)}`
      : ''
  );

  await checkPDA(connection, 'Staker (admin)', stakerPDA, (d) =>
    d.length >= 8 + 32 + 8
      ? `staked=${readU64LE(d, 8 + 32)}`
      : ''
  );

  // Check custom wallet if provided
  const customWallet = process.env.CHECK_WALLET;
  if (customWallet) {
    const userKey = new PublicKey(customWallet);
    const [userStakerPDA] = deriveStakerPDA(userKey);
    console.log(`\n📍 Staker PDA untuk ${customWallet.slice(0, 12)}...:`);
    await checkPDA(connection, 'Staker (user)', userStakerPDA, (d) =>
      d.length >= 8 + 32 + 8 + 8 + 8 + 32 + 1
        ? `staked=${readU64LE(d, 8 + 32)} delegated=${d[8 + 32 + 8 + 8 + 8 + 32] === 1 ? 'YES' : 'NO'}`
        : ''
    );
  }

  console.log('\n💡 Jika ada ❌, jalankan: npx ts-node scripts/init-devnet.ts\n');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
