/**
 * shared/api/solanaQueries.ts
 *
 * Centralized Solana on-chain data fetching functions + query key factory.
 *
 * Why centralized:
 * - Shared query keys ensure React Query cache deduplication
 * - Raw fetch functions can be tested independently
 * - Single place to add retry/rate-limit logic
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

import { HELIUS_API_KEY, SKR_MINT_ADDRESS } from '../config/constants';

// ── Query Key Factory ────────────────────────────────────────────────────────
// Structured keys enable granular invalidation: queryClient.invalidateQueries({ queryKey: solanaKeys.all })

export const solanaKeys = {
  all: ['solana'] as const,
  balances: (publicKey: string) => [...solanaKeys.all, 'balance', publicKey] as const,
  sol: (publicKey: string) => [...solanaKeys.balances(publicKey), 'SOL'] as const,
  skr: (publicKey: string) => [...solanaKeys.balances(publicKey), 'SKR'] as const,
  nfts: (publicKey: string) => [...solanaKeys.all, 'nfts', publicKey] as const,
};

// ── SOL Balance ──────────────────────────────────────────────────────────────

export async function fetchSOLBalance(
  connection: Connection,
  publicKey: string,
): Promise<number> {
  const pk = new PublicKey(publicKey);
  const lamports = await connection.getBalance(pk);
  return lamports / LAMPORTS_PER_SOL;
}

// ── SPL Token Balance (SKR) ──────────────────────────────────────────────────

export interface TokenBalanceResult {
  balance: number;
  /** Raw UI amount string from chain (preserves precision) */
  uiAmountString: string;
  decimals: number;
}

export async function fetchSKRBalance(
  connection: Connection,
  publicKey: string,
): Promise<TokenBalanceResult> {
  if (!SKR_MINT_ADDRESS) {
    return { balance: 0, uiAmountString: '0', decimals: 6 };
  }

  const owner = new PublicKey(publicKey);
  const mint = new PublicKey(SKR_MINT_ADDRESS);

  try {
    const result = await connection.getParsedTokenAccountsByOwner(owner, { mint });
    const info = result.value[0]?.account.data.parsed.info;

    if (!info) {
      return { balance: 0, uiAmountString: '0', decimals: 6 };
    }

    const amount = info.tokenAmount;
    return {
      balance: amount.uiAmount ?? 0,
      uiAmountString: amount.uiAmountString ?? '0',
      decimals: amount.decimals ?? 6,
    };
  } catch {
    return { balance: 0, uiAmountString: '0', decimals: 6 };
  }
}

// ── NFTs via Helius DAS API ──────────────────────────────────────────────────

export interface NFTAsset {
  id: string;
  name: string;
  image: string;
  description: string;
  collection: string | null;
  attributes: Array<{ trait_type: string; value: string }>;
}

/**
 * Fetch NFTs owned by a wallet via the Helius Digital Asset Standard (DAS) API.
 *
 * Falls back to an empty array if Helius API key is not configured.
 * Uses getAssetsByOwner with displayOptions for optimal data.
 */
export async function fetchNFTs(publicKey: string): Promise<NFTAsset[]> {
  if (!HELIUS_API_KEY) {
    console.warn('[solanaQueries] No HELIUS_API_KEY — NFT fetch skipped');
    return [];
  }

  const url = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'ecoquest-nfts',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: publicKey,
        page: 1,
        limit: 50,
        displayOptions: {
          showFungible: false,
          showNativeBalance: false,
          showCollectionMetadata: true,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Helius DAS API error: ${response.status}`);
  }

  const json = await response.json();
  const items: any[] = json?.result?.items ?? [];

  return items
    .filter((item: any) => {
      // Include standard NFTs + compressed NFTs (Bubblegum)
      const iface = item.interface;
      return (
        iface === 'V1_NFT' ||
        iface === 'ProgrammableNFT' ||
        iface === 'V1_PRINT' ||
        item.compression?.compressed === true // Bubblegum cNFTs
      );
    })
    .map((item: any): NFTAsset => {
      const content = item.content ?? {};
      const metadata = content.metadata ?? {};
      const files = content.files ?? [];
      const links = content.links ?? {};

      return {
        id: item.id,
        name: metadata.name ?? 'Unknown NFT',
        image: links.image ?? files[0]?.uri ?? '',
        description: metadata.description ?? '',
        collection: item.grouping?.[0]?.group_value ?? null,
        attributes: metadata.attributes ?? [],
      };
    });
}
