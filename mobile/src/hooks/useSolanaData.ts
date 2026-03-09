/**
 * hooks/useSolanaData.ts
 *
 * High-performance React Query hooks for Solana on-chain data.
 *
 * Architecture:
 * - Three granular hooks: useSolBalance, useSKRBalance, useNFTs
 * - One combined hook: useOnChainData (for Dashboard / Profile)
 * - All queries share the solanaKeys factory → automatic deduplication
 * - SWR configured at QueryClient level (30s staleTime, 5min gcTime)
 * - Queries auto-disable when publicKey is null (demo mode / disconnected)
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getConnection } from '../shared/api/solana';
import {
  solanaKeys,
  fetchSOLBalance,
  fetchSKRBalance,
  fetchNFTs,
  type TokenBalanceResult,
  type NFTAsset,
} from '../shared/api/solanaQueries';
import { HELIUS_API_KEY, SKR_MINT_ADDRESS } from '../shared/config/constants';

// ── SOL Balance Hook ─────────────────────────────────────────────────────────

export interface UseSolBalanceReturn {
  sol: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useSolBalance(publicKey: string | null): UseSolBalanceReturn {
  const connection = getConnection();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: solanaKeys.sol(publicKey ?? ''),
    queryFn: () => fetchSOLBalance(connection, publicKey!),
    enabled: !!publicKey,
  });

  return {
    sol: data ?? 0,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// ── SKR Token Balance Hook ───────────────────────────────────────────────────

export interface UseSKRBalanceReturn {
  skr: number;
  uiAmountString: string;
  decimals: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useSKRBalance(publicKey: string | null): UseSKRBalanceReturn {
  const connection = getConnection();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: solanaKeys.skr(publicKey ?? ''),
    queryFn: () => fetchSKRBalance(connection, publicKey!),
    enabled: !!publicKey,
  });

  const fallback: TokenBalanceResult = { balance: 0, uiAmountString: '0', decimals: 6 };
  const result = data ?? fallback;

  return {
    skr: result.balance,
    uiAmountString: result.uiAmountString,
    decimals: result.decimals,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// ── NFTs Hook ────────────────────────────────────────────────────────────────

export interface UseNFTsReturn {
  nfts: NFTAsset[];
  count: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useNFTs(publicKey: string | null): UseNFTsReturn {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: solanaKeys.nfts(publicKey ?? ''),
    queryFn: () => fetchNFTs(publicKey!),
    enabled: !!publicKey,
    // NFTs change less frequently — longer staleTime
    staleTime: 60_000,
  });

  const nfts = data ?? [];

  return {
    nfts,
    count: nfts.length,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// ── Combined Hook (Dashboard / Profile) ──────────────────────────────────────

export interface UseOnChainDataReturn {
  // SOL
  sol: number;
  solLoading: boolean;
  solError: boolean;
  // SKR
  skr: number;
  skrUiAmount: string;
  skrLoading: boolean;
  skrError: boolean;
  // NFTs
  nfts: NFTAsset[];
  nftCount: number;
  nftsLoading: boolean;
  nftsError: boolean;
  // Aggregated
  isAnyLoading: boolean;
  isAnyError: boolean;
  /** Refetch all three queries — ideal for pull-to-refresh */
  refetchAll: () => Promise<void>;
}

export function useOnChainData(publicKey: string | null): UseOnChainDataReturn {
  const queryClient = useQueryClient();
  const solQuery = useSolBalance(publicKey);
  const skrQuery = useSKRBalance(publicKey);
  const nftQuery = useNFTs(publicKey);

  const refetchAll = async () => {
    // Invalidate all solana-related queries for this wallet
    await queryClient.invalidateQueries({
      queryKey: solanaKeys.all,
    });
  };

  return {
    // SOL
    sol: solQuery.sol,
    solLoading: solQuery.isLoading,
    solError: solQuery.isError,
    // SKR
    skr: skrQuery.skr,
    skrUiAmount: skrQuery.uiAmountString,
    skrLoading: skrQuery.isLoading,
    skrError: skrQuery.isError,
    // NFTs
    nfts: nftQuery.nfts,
    nftCount: nftQuery.count,
    nftsLoading: nftQuery.isLoading,
    nftsError: nftQuery.isError,
    // Aggregated
    isAnyLoading: solQuery.isLoading || skrQuery.isLoading || nftQuery.isLoading,
    isAnyError: solQuery.isError || skrQuery.isError || nftQuery.isError,
    refetchAll,
  };
}

// ── Leaderboard Hook (Top SKR Holders) ────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  address: string;  // full base58 address
  displayName: string;  // truncated e.g. "Ab12...Xy78"
  skrBalance: number;
  isMe: boolean;
}

export interface UseLeaderboardReturn {
  leaderboard: LeaderboardEntry[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Fetches the top SKR token holders from Helius getTokenLargestAccounts.
 * Falls back to empty array if SKR mint is not configured or Helius key is missing.
 */
async function fetchLeaderboard(myPublicKey: string | null): Promise<LeaderboardEntry[]> {
  if (!SKR_MINT_ADDRESS) return [];

  const rpcUrl = HELIUS_API_KEY
    ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'https://api.devnet.solana.com';

  // getTokenLargestAccounts returns up to 20 largest token accounts for the mint
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'leaderboard',
      method: 'getTokenLargestAccounts',
      params: [SKR_MINT_ADDRESS, { commitment: 'confirmed' }],
    }),
  });

  if (!res.ok) throw new Error(`Leaderboard RPC error: ${res.status}`);
  const json = await res.json();
  const accounts: any[] = json?.result?.value ?? [];

  // For each token account, fetch the owner via getAccountInfo
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < Math.min(accounts.length, 10); i++) {
    const tokenAccount = accounts[i];
    const balance = tokenAccount.uiAmount ?? 0;
    // Use token account address as display — owner lookup would need extra RPC calls
    // We store the token account address but display truncated
    const address: string = tokenAccount.address ?? '';
    const isMe = myPublicKey ? address === myPublicKey : false;
    const display = address.length >= 8
      ? `${address.slice(0, 4)}...${address.slice(-4)}`
      : address;

    entries.push({
      rank: i + 1,
      address,
      displayName: isMe ? 'You' : display,
      skrBalance: balance,
      isMe,
    });
  }

  return entries;
}

export function useLeaderboard(myPublicKey: string | null): UseLeaderboardReturn {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['solana', 'leaderboard', SKR_MINT_ADDRESS],
    queryFn: () => fetchLeaderboard(myPublicKey),
    enabled: !!SKR_MINT_ADDRESS,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return {
    leaderboard: data ?? [],
    isLoading,
    isError,
    refetch,
  };
}
