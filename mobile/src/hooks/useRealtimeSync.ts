// ─────────────────────────────────────────────────────────────────────────────
// useRealtimeSync — WebSocket → React Query Auto-Invalidation
//
// Bridges the existing useHeliusWebSocket (push-based program events) with
// React Query's cache invalidation so the UI updates instantly when:
//   • A StakeEvent arrives       → invalidate ['solana'] + ['staker']
//   • A QuestCompletedEvent      → invalidate ['solana']
//   • A DuelSettledEvent         → invalidate ['solana']
//
// This eliminates the polling delay for balance updates after transactions.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useHeliusWebSocket, ProgramEvent } from './useHeliusWebSocket';

/**
 * Activate real-time sync: WebSocket program events auto-invalidate
 * React Query caches so the UI updates within seconds of on-chain confirmation.
 *
 * Place this once at the app level (e.g. AppNavigation) so all screens benefit.
 *
 * @param publicKeyBase58 - Current wallet public key (for filtering own events)
 *
 * @example
 * function AppNavigation() {
 *   const { publicKeyBase58 } = useWallet();
 *   useRealtimeSync(publicKeyBase58);
 *   // ...
 * }
 */
export function useRealtimeSync(publicKeyBase58: string | null) {
  const queryClient = useQueryClient();

  const handleEvent = useCallback(
    (event: ProgramEvent) => {
      console.log(`[RealtimeSync] Received ${event.type}, invalidating queries`);

      switch (event.type) {
        case 'StakeEvent':
          // Staking affects: SOL balance (gas), SKR balance, staker account
          queryClient.invalidateQueries({ queryKey: ['solana'] });
          queryClient.invalidateQueries({ queryKey: ['staker'] });
          break;

        case 'QuestCompletedEvent':
          // Quest completion may mint NFT → affects SOL + NFT queries
          queryClient.invalidateQueries({ queryKey: ['solana'] });
          break;

        case 'DuelSettledEvent':
          // PvP duel settlement → affects SOL + SKR balances
          queryClient.invalidateQueries({ queryKey: ['solana'] });
          break;
      }
    },
    [queryClient],
  );

  return useHeliusWebSocket(handleEvent);
}
