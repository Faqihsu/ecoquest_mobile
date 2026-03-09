/**
 * shared/api/queryClient.ts
 * React Query client — optimized for Solana RPC data
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Solana data changes every ~400ms (slot time), but UI doesn't need that
      staleTime: 30_000,          // 30s — treat data as fresh
      gcTime: 5 * 60_000,        // 5min — keep in cache
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false, // RN doesn't have window focus
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0, // Never auto-retry mutations (tx could double-submit)
    },
  },
});
