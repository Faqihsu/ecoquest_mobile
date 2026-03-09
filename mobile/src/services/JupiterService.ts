// ─────────────────────────────────────────────────────────────────────────────
// Jupiter Swap Service — Devnet
//
// Uses Jupiter Aggregator v6 API to:
//   1. Get the best swap quote for any token pair
//   2. Build the optimized swap transaction
//   3. Execute via MWA (Mobile Wallet Adapter) signing
//
// Supported pairs: SKR ↔ SOL ↔ USDC on devnet
// API Docs: https://quote-api.jup.ag/v6
// ─────────────────────────────────────────────────────────────────────────────

import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getConnection } from '../shared/lib/rpcConnection';
import { SKR_MINT_ADDRESS } from '../shared/config/constants';

// ── Config ────────────────────────────────────────────────────────────────────

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API  = 'https://quote-api.jup.ag/v6/swap';
const JUPITER_PRICE_API = 'https://price.jup.ag/v6/price';
const REQUEST_TIMEOUT_MS = 10_000;

// Devnet token mint addresses — SKR diambil dari env EXPO_PUBLIC_SKR_MINT
export const SWAP_TOKENS = {
  SOL:  'So11111111111111111111111111111111111111112',   // Wrapped SOL
  USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',  // Devnet USDC
  SKR:  SKR_MINT_ADDRESS || 'So11111111111111111111111111111111111111112', // Fallback ke wSOL jika belum diset
};

/** True jika SKR_MINT sudah diset di environment */
export const skrMintConfigured = Boolean(SKR_MINT_ADDRESS);

export type TokenKey = keyof typeof SWAP_TOKENS;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;         // lamports / smallest unit
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: number;
  routePlan: Array<{ swapInfo: { label: string } }>;
  contextSlot: number;
  timeTaken: number;
  // raw Jupiter response
  _raw: object;
}

export interface SwapResult {
  txSignature: string;
  inputAmount: number;
  outputAmount: number;
  inputToken: TokenKey;
  outputToken: TokenKey;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert human-readable amount to smallest unit (lamports for SOL, μ for tokens) */
export function toSmallestUnit(amount: number, token: TokenKey): number {
  switch (token) {
    case 'SOL':  return Math.floor(amount * 1e9);            // 9 decimals
    case 'USDC': return Math.floor(amount * 1e6);            // 6 decimals
    case 'SKR':  return Math.floor(amount * 1e6);            // 6 decimals (adjust if needed)
    default:     return Math.floor(amount * 1e6);
  }
}

export function fromSmallestUnit(amount: number, token: TokenKey): number {
  switch (token) {
    case 'SOL':  return amount / 1e9;
    case 'USDC': return amount / 1e6;
    case 'SKR':  return amount / 1e6;
    default:     return amount / 1e6;
  }
}

// ── Step 1: Get Quote ─────────────────────────────────────────────────────────

/**
 * Fetch the best swap quote from Jupiter Aggregator.
 *
 * @param fromToken - Source token key (e.g. 'SOL')
 * @param toToken   - Destination token key (e.g. 'USDC')
 * @param amount    - Human-readable amount (e.g. 0.1 for 0.1 SOL)
 * @param slippageBps - Slippage tolerance in basis points (default 50 = 0.5%)
 */
export async function getSwapQuote(
  fromToken: TokenKey,
  toToken: TokenKey,
  amount: number,
  slippageBps = 50
): Promise<SwapQuote> {
  const inputMint  = SWAP_TOKENS[fromToken];
  const outputMint = SWAP_TOKENS[toToken];
  const inAmount   = toSmallestUnit(amount, fromToken);

  const url = new URL(JUPITER_QUOTE_API);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', String(inAmount));
  url.searchParams.set('slippageBps', String(slippageBps));
  url.searchParams.set('onlyDirectRoutes', 'false');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    // Parse Jupiter-specific errors
    if (text.includes('Could not find any route') || text.includes('No route found')) {
      throw new Error(
        `Tidak ada route swap ${fromToken}→${toToken} di devnet.\n` +
        'Coba pasangan SOL↔USDC yang tersedia di devnet.'
      );
    }
    throw new Error(`Jupiter quote gagal (${res.status}): ${text.slice(0, 120)}`);
  }

  const data = await res.json();
  return {
    inputMint,
    outputMint,
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    otherAmountThreshold: data.otherAmountThreshold,
    priceImpactPct: parseFloat(data.priceImpactPct ?? '0'),
    routePlan: data.routePlan ?? [],
    contextSlot: data.contextSlot ?? 0,
    timeTaken: data.timeTaken ?? 0,
    _raw: data,
  };
}

// ── Step 2: Build Swap Transaction ────────────────────────────────────────────

/**
 * Build an optimized swap VersionedTransaction from a Jupiter quote.
 */
export async function buildSwapTransaction(
  quote: SwapQuote,
  userPublicKey: PublicKey
): Promise<VersionedTransaction> {
  const res = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote._raw,
      userPublicKey: userPublicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter swap build failed (${res.status}): ${text}`);
  }

  const { swapTransaction } = await res.json();
  const txBuffer = Buffer.from(swapTransaction, 'base64');
  return VersionedTransaction.deserialize(txBuffer);
}

// ── Step 3: Execute Swap ─────────────────────────────────────────────────────

/**
 * Sign and send the swap transaction via MWA.
 *
 * @param tx - VersionedTransaction from buildSwapTransaction
 * @param signTransaction - MWA sign function
 */
export async function executeSwap(
  tx: VersionedTransaction,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>
): Promise<string> {
  const signedTx = await signTransaction(tx);
  const connection = await getConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction({
    blockhash,
    lastValidBlockHeight,
    signature,
  }, 'confirmed');

  console.log(`[JupiterService] Swap executed. TX: ${signature}`);
  return signature;
}

// ── Combined convenience function ─────────────────────────────────────────────

/**
 * Full swap pipeline: quote → build → sign → send.
 * Returns SwapResult with amounts and signature.
 */
export async function swapTokens(
  fromToken: TokenKey,
  toToken: TokenKey,
  amount: number,
  userPublicKey: PublicKey,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  slippageBps = 50
): Promise<SwapResult> {
  const quote = await getSwapQuote(fromToken, toToken, amount, slippageBps);
  const tx = await buildSwapTransaction(quote, userPublicKey);
  const signature = await executeSwap(tx, signTransaction);

  return {
    txSignature: signature,
    inputAmount: amount,
    outputAmount: fromSmallestUnit(parseInt(quote.outAmount), toToken),
    inputToken: fromToken,
    outputToken: toToken,
  };
}

// ── Price API ───────────────────────────────────────────────────────────────────

export interface SKRPriceData {
  /** Price in USD */
  priceUSD: number;
  /** Price in SOL */
  priceSOL: number;
  /** 24h change percentage (null if unavailable) */
  change24h: number | null;
  /** Timestamp of price fetch */
  fetchedAt: number;
}

/**
 * Fetch real-time SKR price from Jupiter Price API v2.
 * Returns price in both USD and SOL.
 */
export async function fetchSKRPrice(): Promise<SKRPriceData> {
  if (!SKR_MINT_ADDRESS) {
    throw new Error('[Jupiter] SKR_MINT_ADDRESS not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    const [usdRes, solRes] = await Promise.all([
      fetch(
        `${JUPITER_PRICE_API}?ids=${SKR_MINT_ADDRESS}&vsToken=${USDC_MINT}`,
        { signal: controller.signal },
      ),
      fetch(
        `${JUPITER_PRICE_API}?ids=${SKR_MINT_ADDRESS}&vsToken=${SWAP_TOKENS.SOL}`,
        { signal: controller.signal },
      ),
    ]);

    clearTimeout(timer);

    if (!usdRes.ok || !solRes.ok) {
      throw new Error(`Jupiter Price API error: USD=${usdRes.status}, SOL=${solRes.status}`);
    }

    const usdJson = await usdRes.json();
    const solJson = await solRes.json();

    const usdData = usdJson?.data?.[SKR_MINT_ADDRESS];
    const solData = solJson?.data?.[SKR_MINT_ADDRESS];

    return {
      priceUSD: usdData?.price ?? 0,
      priceSOL: solData?.price ?? 0,
      change24h: null,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

