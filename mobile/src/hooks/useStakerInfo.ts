/**
 * hooks/useStakerInfo.ts
 *
 * React Query hook that fetches the on-chain `stakerPDA` account for a wallet.
 * Returns stakedAmount (in SKR) and lastClaimAt timestamp.
 *
 * Uses stakingService.getStakerInfo() which parses the raw Anchor account layout:
 *   8 (discriminator) + 32 (user key) + 8 (staked_amount u64) + 8 (last_claim_at i64) + 1 (bump)
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { stakingService } from '../services/StakingService';

export interface StakerInfo {
  stakedAmount: number;   // SKR in human units
  lastClaimAt: number;    // Unix timestamp (seconds)
}

/** APY 20% — used for real-time pending rewards estimation */
const STAKING_APY = 0.20;
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

/**
 * Calculate pending rewards based on staked amount, APY, and time elapsed.
 * Formula: stakedAmount × (APY / secondsPerYear) × elapsedSeconds
 */
export function calculatePendingRewards(stakerInfo: StakerInfo | null): number {
  if (!stakerInfo || stakerInfo.stakedAmount <= 0 || stakerInfo.lastClaimAt <= 0) return 0;
  const now = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, now - stakerInfo.lastClaimAt);
  return stakerInfo.stakedAmount * (STAKING_APY / SECONDS_PER_YEAR) * elapsed;
}

const stakerKeys = {
  all: ['staker'] as const,
  info: (publicKey: string) => ['staker', 'info', publicKey] as const,
};

export interface UseStakerInfoReturn {
  stakerInfo: StakerInfo | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useStakerInfo(publicKeyBase58: string | null): UseStakerInfoReturn {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: stakerKeys.info(publicKeyBase58 ?? ''),
    queryFn: async () => {
      const pk = new PublicKey(publicKeyBase58!);
      return stakingService.getStakerInfo(pk);
    },
    enabled: !!publicKeyBase58,
    staleTime: 10_000,
    refetchInterval: 15_000, // 15s fallback polling (WebSocket handles instant updates)
  });

  return {
    stakerInfo: data ?? null,
    isLoading,
    isError,
    refetch,
  };
}

/**
 * Invalidate the staker info query — call after stake/unstake/claim.
 */
export function useInvalidateStakerInfo() {
  const queryClient = useQueryClient();
  return (publicKeyBase58: string) => {
    queryClient.invalidateQueries({ queryKey: stakerKeys.info(publicKeyBase58) });
  };
}
