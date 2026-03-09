/**
 * hooks/useJupiterPrice.ts — Real-Time SKR Price Hook
 *
 * Polls Jupiter Price API every 30s for live SKR/USD and SKR/SOL rates.
 *
 * Usage:
 *   const { priceUSD, priceSOL, isLoading } = useJupiterPrice();
 */

import { useQuery } from '@tanstack/react-query';
import { fetchSKRPrice, type SKRPriceData } from '../services/JupiterService';
import { SKR_MINT_ADDRESS } from '../shared/config/constants';

export function useJupiterPrice() {
  const query = useQuery<SKRPriceData>({
    queryKey: ['jupiter-price', SKR_MINT_ADDRESS],
    queryFn: fetchSKRPrice,
    enabled: !!SKR_MINT_ADDRESS,
    staleTime: 30_000,        // 30s — price is fresh
    refetchInterval: 30_000,   // Poll every 30s
    retry: 2,
    placeholderData: {
      priceUSD: 0,
      priceSOL: 0,
      change24h: null,
      fetchedAt: 0,
    },
  });

  return {
    priceUSD: query.data?.priceUSD ?? 0,
    priceSOL: query.data?.priceSOL ?? 0,
    change24h: query.data?.change24h ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
