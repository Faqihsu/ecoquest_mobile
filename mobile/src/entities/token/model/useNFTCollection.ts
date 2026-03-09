/**
 * entities/token/model/useNFTCollection.ts
 *
 * React Query hook — fetch user's NFTs via Helius DAS API.
 *
 * NFTs change rarely, so we use a longer staleTime (60s).
 * Falls back to empty array if HELIUS_API_KEY is not set.
 *
 * Usage:
 *   const { data: nfts, isLoading, error, refetch } = useNFTCollection();
 */
import { useQuery } from '@tanstack/react-query';

import { solanaKeys, fetchNFTs, type NFTAsset } from '../../../shared/api/solanaQueries';
import { useWalletStore } from '../../wallet/model/walletStore';

export function useNFTCollection() {
  const publicKey = useWalletStore((s) => s.publicKey);

  return useQuery<NFTAsset[]>({
    queryKey: solanaKeys.nfts(publicKey ?? ''),
    queryFn: () => fetchNFTs(publicKey!),
    enabled: !!publicKey,
    staleTime: 60_000,       // 60s — NFTs change rarely
    refetchInterval: 120_000, // Auto-refresh every 2 min
    placeholderData: [],
  });
}

// Re-export types for UI consumption
export type { NFTAsset } from '../../../shared/api/solanaQueries';
