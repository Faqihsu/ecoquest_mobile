/**
 * entities/token/model/useSOLBalance.ts
 *
 * React Query hook — fetch native SOL balance with SWR caching.
 *
 * Usage:
 *   const { data: solBalance, isLoading, error, refetch } = useSOLBalance();
 */
import { useQuery } from '@tanstack/react-query';

import { getConnection } from '../../../shared/api/solana';
import { solanaKeys, fetchSOLBalance } from '../../../shared/api/solanaQueries';
import { useWalletStore } from '../../wallet/model/walletStore';

export function useSOLBalance() {
  const publicKey = useWalletStore((s) => s.publicKey);
  const connection = getConnection();

  return useQuery({
    queryKey: solanaKeys.sol(publicKey ?? ''),
    queryFn: () => fetchSOLBalance(connection, publicKey!),
    enabled: !!publicKey,
    staleTime: 15_000,      // 15s — balances can change frequently
    refetchInterval: 30_000, // Auto-refresh every 30s when mounted
    placeholderData: 0,
  });
}
