#!/usr/bin/env ts-node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/init-devnet.ts
//
// Inisialisasi SEMUA PDAs EcoQuest di Solana Devnet dalam satu script.
//
// Jalankan:
//   npx ts-node scripts/init-devnet.ts
//   # atau dengan wallet custom:
//   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/init-devnet.ts
//
// Urutan inisialisasi:
//   1. initialize_quest_program — PDA ["quest_program"]
//   2. initialize_stake_pool    — PDA ["stake_pool"] + vault
//   3. initialize_governance    — PDA ["governance"]
//   4. initialize_arena         — PDA ["arena"]
//   5. initialize_staker        — PDA ["staker", authority] (untuk admin wallet)
// ─────────────────────────────────────────────────────────────────────────────

import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const PROGRAM_ID    = new PublicKey('4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5');
const RPC_ENDPOINT  = 'https://api.devnet.solana.com';
const SPL_TOKEN_ID  = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Devnet USDC mint (bisa ganti dengan SKR mint setelah deploy)
// Ganti SKR_MINT dengan mint address SKR token kamu di devnet
const SKR_MINT_ENV  = process.env.SKR_MINT ?? '';

// APY: 3500 basis points = 35%
const APY_BPS = 3500;

// ── Load Wallet ───────────────────────────────────────────────────────────────

function loadWallet(): Keypair {
  const walletPath =
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), '.config', 'solana', 'id.json');

  if (!fs.existsSync(walletPath)) {
    console.error(`❌ Wallet tidak ditemukan: ${walletPath}`);
    console.error('   Buat dulu dengan: solana-keygen new -o ~/.config/solana/id.json');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ── Load IDL ──────────────────────────────────────────────────────────────────

function loadIdl(): anchor.Idl {
  const idlPath = path.join(__dirname, '../mobile/src/shared/idl/ecoquest_mobile.json');
  if (!fs.existsSync(idlPath)) {
    // Fallback ke target/idl
    const altPath = path.join(__dirname, '../target/idl/ecoquest_mobile.json');
    if (!fs.existsSync(altPath)) {
      console.error('❌ IDL tidak ditemukan. Jalankan `anchor build` terlebih dahulu.');
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(altPath, 'utf-8'));
  }
  return JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
}

// ── PDA Derivation ────────────────────────────────────────────────────────────

function deriveQuestProgramPDA()    { return PublicKey.findProgramAddressSync([Buffer.from('quest_program')], PROGRAM_ID); }
function deriveStakePoolPDA()       { return PublicKey.findProgramAddressSync([Buffer.from('stake_pool')],    PROGRAM_ID); }
function deriveVaultPDA(pool: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from('stake_vault'), pool.toBuffer()], PROGRAM_ID); }
function deriveGovernancePDA()      { return PublicKey.findProgramAddressSync([Buffer.from('governance')],    PROGRAM_ID); }
function deriveArenaPDA()           { return PublicKey.findProgramAddressSync([Buffer.from('pvp_arena')],     PROGRAM_ID); }
function deriveStakerPDA(user: PublicKey) { return PublicKey.findProgramAddressSync([Buffer.from('staker'), user.toBuffer()], PROGRAM_ID); }

// ── Check if already initialized ─────────────────────────────────────────────

async function isInitialized(connection: Connection, pda: PublicKey): Promise<boolean> {
  const info = await connection.getAccountInfo(pda);
  return info !== null;
}

// ── Print helper ──────────────────────────────────────────────────────────────

function ok(msg: string)   { console.log(`  ✅ ${msg}`); }
function skip(msg: string) { console.log(`  ⏭️  ${msg} (sudah ada)`); }
function err(msg: string)  { console.log(`  ❌ ${msg}`); }
function sub(msg: string)  { console.log(`     ${msg}`); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌿 EcoQuest Devnet Initialization Script');
  console.log('════════════════════════════════════════\n');

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const wallet     = loadWallet();
  const idl        = loadIdl();

  console.log(`📍 Program ID  : ${PROGRAM_ID.toBase58()}`);
  console.log(`👛 Admin Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`🌐 Cluster     : Devnet\n`);

  // ── Check balance ──────────────────────────────────────────────────────────
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`💰 Wallet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.log('\n⚠️  Balance terlalu rendah! Airdrop 2 SOL...');
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
      console.log(`   ✅ Airdrop sukses: ${sig}`);
    } catch {
      console.error('   ❌ Airdrop gagal. Gunakan: solana airdrop 2 --url devnet');
      process.exit(1);
    }
  }

  // ── Setup Anchor Provider ──────────────────────────────────────────────────
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: 'confirmed', skipPreflight: false }
  );
  anchor.setProvider(provider);

  const program = new anchor.Program(idl, provider);

  // ── 1. Quest Program ───────────────────────────────────────────────────────
  console.log('\n[1/5] Quest Program PDA');
  const [questProgramPDA] = deriveQuestProgramPDA();
  sub(`PDA: ${questProgramPDA.toBase58()}`);

  if (await isInitialized(connection, questProgramPDA)) {
    skip('initialize_quest_program');
  } else {
    try {
      const tx = await (program.methods as any)
        .initializeQuestProgram()
        .accounts({
          authority:    wallet.publicKey,
          questProgram: questProgramPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet])
        .rpc();
      ok(`initialize_quest_program — TX: ${tx}`);
    } catch (e: any) {
      err(`initialize_quest_program gagal: ${e.message}`);
    }
  }

  // ── 2. Stake Pool ─────────────────────────────────────────────────────────
  console.log('\n[2/5] Stake Pool + Vault');
  const [poolPDA]  = deriveStakePoolPDA();
  const [vaultPDA] = deriveVaultPDA(poolPDA);
  sub(`Pool PDA : ${poolPDA.toBase58()}`);
  sub(`Vault PDA: ${vaultPDA.toBase58()}`);

  if (!SKR_MINT_ENV) {
    err('SKR_MINT env var kosong! Set dengan: SKR_MINT=<alamat_mint> npx ts-node scripts/init-devnet.ts');
    console.log('     ⏭️  Lewati initialize_stake_pool');
  } else if (await isInitialized(connection, poolPDA)) {
    skip('initialize_stake_pool');
  } else {
    try {
      const skrMint = new PublicKey(SKR_MINT_ENV);
      const tx = await (program.methods as any)
        .initializeStakePool(APY_BPS)
        .accounts({
          authority:    wallet.publicKey,
          skrMint:      skrMint,
          pool:         poolPDA,
          vault:        vaultPDA,
          systemProgram: SystemProgram.programId,
          tokenProgram: SPL_TOKEN_ID,
        })
        .signers([wallet])
        .rpc();
      ok(`initialize_stake_pool (APY: ${APY_BPS / 100}%) — TX: ${tx}`);
    } catch (e: any) {
      err(`initialize_stake_pool gagal: ${e.message}`);
    }
  }

  // ── 3. Governance ─────────────────────────────────────────────────────────
  console.log('\n[3/5] Governance');
  const [govPDA] = deriveGovernancePDA();
  sub(`PDA: ${govPDA.toBase58()}`);

  if (await isInitialized(connection, govPDA)) {
    skip('initialize_governance');
  } else {
    try {
      const tx = await (program.methods as any)
        .initializeGovernance()
        .accounts({
          authority:    wallet.publicKey,
          governance:   govPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet])
        .rpc();
      ok(`initialize_governance — TX: ${tx}`);
    } catch (e: any) {
      err(`initialize_governance gagal: ${e.message}`);
    }
  }

  // ── 4. Arena (PvP) ────────────────────────────────────────────────────────
  console.log('\n[4/5] PvP Arena');
  const [arenaPDA] = deriveArenaPDA();
  sub(`PDA: ${arenaPDA.toBase58()}`);

  if (await isInitialized(connection, arenaPDA)) {
    skip('initialize_arena');
  } else {
    try {
      const tx = await (program.methods as any)
        .initializeArena()
        .accounts({
          authority:    wallet.publicKey,
          arena:        arenaPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet])
        .rpc();
      ok(`initialize_arena — TX: ${tx}`);
    } catch (e: any) {
      err(`initialize_arena gagal: ${e.message}`);
    }
  }

  // ── 5. Staker (admin wallet) ──────────────────────────────────────────────
  console.log('\n[5/5] Staker Account (admin wallet)');
  const [stakerPDA] = deriveStakerPDA(wallet.publicKey);
  sub(`PDA: ${stakerPDA.toBase58()}`);

  if (await isInitialized(connection, stakerPDA)) {
    skip('initialize_staker');
  } else {
    try {
      const tx = await (program.methods as any)
        .initializeStaker()
        .accounts({
          user:         wallet.publicKey,
          staker:       stakerPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet])
        .rpc();
      ok(`initialize_staker — TX: ${tx}`);
    } catch (e: any) {
      err(`initialize_staker gagal: ${e.message}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('📋 Status PDA setelah inisialisasi:\n');

  const checks = [
    { name: 'QuestProgram',  pda: questProgramPDA },
    { name: 'StakePool',     pda: poolPDA },
    { name: 'Vault',         pda: vaultPDA },
    { name: 'Governance',    pda: govPDA },
    { name: 'Arena (PvP)',   pda: arenaPDA },
    { name: 'Staker(admin)', pda: stakerPDA },
  ];

  for (const { name, pda } of checks) {
    const exists = await isInitialized(connection, pda);
    console.log(`  ${exists ? '✅' : '❌'} ${name.padEnd(16)} ${pda.toBase58()}`);
  }

  const finalBalance = await connection.getBalance(wallet.publicKey);
  console.log(`\n💰 Sisa balance: ${(finalBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log('\n🎉 Inisialisasi selesai! Semua fitur EcoQuest siap digunakan.\n');
}

main().catch((e) => {
  console.error('\n❌ Fatal error:', e.message ?? e);
  process.exit(1);
});
