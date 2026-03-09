#!/usr/bin/env ts-node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/mint-skr-devnet.ts
//
// Buat SKR token mint baru di Solana Devnet dan mint token ke admin wallet.
// HANYA jalankan sekali — simpan SKR_MINT address ke .env setelah selesai.
//
// Jalankan:
//   npx ts-node scripts/mint-skr-devnet.ts
//
// Output:
//   SKR_MINT=<address>  ← copy ke .env
//   Admin ATA: <address>
// ─────────────────────────────────────────────────────────────────────────────

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const RPC_ENDPOINT   = 'https://api.devnet.solana.com';
const SKR_DECIMALS   = 6;
const MINT_AMOUNT    = 10_000_000; // 10 juta SKR untuk testing
const SPL_TOKEN_ID   = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv');

// ── Load wallet ───────────────────────────────────────────────────────────────

function loadWallet(): Keypair {
  const walletPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), '.config', 'solana', 'id.json');
  const raw = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ── Derive ATA ────────────────────────────────────────────────────────────────

function deriveATA(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID
  );
  return ata;
}

// ── Create mint instruction ────────────────────────────────────────────────────
// Using raw instructions to avoid @solana/spl-token dependency issues in ts-node

async function main() {
  console.log('\n🌿 EcoQuest — Create SKR Token Mint di Devnet');
  console.log('════════════════════════════════════════\n');

  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const admin = loadWallet();
  console.log(`👛 Admin: ${admin.publicKey.toBase58()}`);

  // Check if .env already has SKR_MINT
  const envPath = path.join(__dirname, '../mobile/.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const existing = envContent.match(/EXPO_PUBLIC_SKR_MINT=(.+)/);
    if (existing && existing[1].trim()) {
      console.log(`\n⚠️  SKR_MINT sudah ada di .env: ${existing[1].trim()}`);
      console.log('   Hapus baris itu dari .env jika ingin membuat mint baru.\n');
      process.exit(0);
    }
  }

  // Airdrop jika perlu
  const balance = await connection.getBalance(admin.publicKey);
  console.log(`💰 Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log('   Airdrop 2 SOL...');
    const sig = await connection.requestAirdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('   ✅ Airdrop sukses');
  }

  // Generate new mint keypair
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  console.log(`\n🪙 Mint address (BARU): ${mint.toBase58()}`);

  // Derive ATA for admin
  const adminATA = deriveATA(admin.publicKey, mint);
  console.log(`📦 Admin ATA: ${adminATA.toBase58()}`);

  // ── Run via solana CLI (paling reliable di devnet) ─────────────────────────
  const { execSync } = require('child_process');
  try {
    console.log('\n📡 Membuat mint via solana CLI...');

    // Create mint
    execSync(
      `spl-token create-token --decimals ${SKR_DECIMALS} --url devnet --owner ${admin.publicKey.toBase58()} ${mint.toBase58()}`,
      { stdio: 'inherit', env: { ...process.env, SOLANA_URL: RPC_ENDPOINT } }
    );

    // Create account (ATA)
    console.log('\n📡 Membuat token account...');
    execSync(
      `spl-token create-account ${mint.toBase58()} --url devnet`,
      { stdio: 'inherit' }
    );

    // Mint tokens
    console.log(`\n📡 Mint ${MINT_AMOUNT.toLocaleString()} SKR...`);
    execSync(
      `spl-token mint ${mint.toBase58()} ${MINT_AMOUNT} --url devnet`,
      { stdio: 'inherit' }
    );

    // ── Update .env ──────────────────────────────────────────────────────────
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    let updated = envContent;
    if (updated.includes('EXPO_PUBLIC_SKR_MINT=')) {
      updated = updated.replace(/EXPO_PUBLIC_SKR_MINT=.*/, `EXPO_PUBLIC_SKR_MINT=${mint.toBase58()}`);
    } else {
      updated += `\nEXPO_PUBLIC_SKR_MINT=${mint.toBase58()}\n`;
    }
    fs.writeFileSync(envPath, updated);

    console.log('\n════════════════════════════════════════');
    console.log('✅ SKR Token berhasil dibuat!\n');
    console.log(`   SKR_MINT=${mint.toBase58()}`);
    console.log(`   Admin ATA: ${adminATA.toBase58()}`);
    console.log(`   Supply   : ${MINT_AMOUNT.toLocaleString()} SKR`);
    console.log('\n📝 EXPO_PUBLIC_SKR_MINT sudah otomatis ditambah ke mobile/.env');
    console.log('\n🔜 Langkah selanjutnya:');
    console.log(`   SKR_MINT=${mint.toBase58()} npx ts-node scripts/init-devnet.ts`);
    console.log();
  } catch (e: any) {
    // Fallback: tampilkan instruksi manual
    console.log('\n⚠️  solana CLI tidak tersedia. Jalankan manual:\n');
    console.log(`spl-token create-token --decimals 6 --url devnet`);
    console.log(`spl-token create-account <MINT_ADDRESS> --url devnet`);
    console.log(`spl-token mint <MINT_ADDRESS> 10000000 --url devnet`);
    console.log(`\nLalu tambahkan ke mobile/.env:`);
    console.log(`EXPO_PUBLIC_SKR_MINT=<MINT_ADDRESS>`);
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
