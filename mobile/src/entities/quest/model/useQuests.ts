/**
 * entities/quest/model/useQuests.ts
 * React Query hook — fetch quests from Solana on-chain + cache
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getConnection } from '../../../shared/api/solana';
import { ECOQUEST_PROGRAM_ID } from '../../../shared/config/constants';
import { useQuestStore } from './questStore';
import type { Quest } from './types';

// Query key factory — enables granular cache invalidation
export const questKeys = {
  all: ['quests'] as const,
  list: (filter?: string) => [...questKeys.all, 'list', filter] as const,
  detail: (id: string) => [...questKeys.all, 'detail', id] as const,
};

async function fetchQuestsFromChain(): Promise<Quest[]> {
  // TODO: Replace with actual Anchor program account fetch
  // const connection = getConnection();
  // const accounts = await connection.getProgramAccounts(ECOQUEST_PROGRAM_ID);
  // return accounts.map(decodeQuestAccount);

  // Mock data for development
  return [
    {
      id: '1',
      title: 'Bersihkan Pantai Ancol',
      description: 'Kumpulkan minimal 5kg sampah plastik di area Pantai Ancol.',
      category: 'Pantai',
      difficulty: 'Easy',
      status: 'available',
      rewardSkr: 80,
      hasNftReward: true,
      location: { latitude: -6.1256, longitude: 106.8451, radiusMeters: 500 },
      slotsTotal: 20,
      slotsFilled: 12,
      expiresAt: Date.now() + 48 * 60 * 60 * 1000,
    },
    {
      id: '2',
      title: 'Tanam Pohon Mangrove',
      description: 'Tanam 3 bibit mangrove di pesisir pantai.',
      category: 'Hutan',
      difficulty: 'Medium',
      status: 'available',
      rewardSkr: 150,
      hasNftReward: true,
      location: { latitude: -6.1, longitude: 106.75, radiusMeters: 300 },
      slotsTotal: 10,
      slotsFilled: 3,
      expiresAt: Date.now() + 72 * 60 * 60 * 1000,
    },
  ] as Quest[];
}

export function useQuests(filter?: string) {
  const setQuests = useQuestStore((s) => s.setQuests);

  const query = useQuery({
    queryKey: questKeys.list(filter),
    queryFn: fetchQuestsFromChain,
    staleTime: 60_000, // 1 min — quests don't change that fast
  });

  // Sync to Zustand store for offline access
  useEffect(() => {
    if (query.data) {
      setQuests(query.data);
    }
  }, [query.data, setQuests]);

  return query;
}
