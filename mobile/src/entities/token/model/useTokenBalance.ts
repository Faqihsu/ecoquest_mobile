/**
 * entities/token/model/useTokenBalance.ts
 *
 * React Query hook — fetch SKR SPL token balance with SWR caching.
 *
 * Enhanced with:
 * - Centralized query keys from solanaQueries
 * - Richer return type (balance, uiAmountString, decimals)
 * - Auto-refetch every 30s
 */
import { useQuery } from '@tanstack/react-query';

import { getConnection } from '../../../shared/api/solana';
import { solanaKeys, fetchSKRBalance, type TokenBalanceResult } from '../../../shared/api/solanaQueries';
import { useWalletStore } from '../../wallet/model/walletStore';

export function useSKRBalance() {
  const publicKey = useWalletStore((s) => s.publicKey);
  const connection = getConnection();

  return useQuery<TokenBalanceResult>({
    queryKey: solanaKeys.skr(publicKey ?? ''),
    queryFn: () => fetchSKRBalance(connection, publicKey!),
    enabled: !!publicKey,
    staleTime: 15_000,       // 15s fresh window
    refetchInterval: 30_000, // Auto-refresh every 30s
    placeholderData: { balance: 0, uiAmountString: '0', decimals: 6 },
  });
}

// Re-export for convenience
export { solanaKeys as tokenKeys };
