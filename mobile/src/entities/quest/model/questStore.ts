/**
 * entities/quest/model/questStore.ts
 * Zustand store for quest state — persisted to AsyncStorage
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { QuestState } from './types';

export const useQuestStore = create<QuestState>()(
  persist(
    (set) => ({
      quests: [],
      activeQuestId: null,
      selectedFilter: 'Semua',

      setQuests: (quests) => set({ quests }),
      setActiveQuest: (id) => set({ activeQuestId: id }),
      setFilter: (filter) => set({ selectedFilter: filter }),
    }),
    {
      name: 'ecoquest-quests',
      storage: createJSONStorage(() => AsyncStorage),
      // Cache quest list for offline browsing
      partialize: (state) => ({
        quests: state.quests,
        selectedFilter: state.selectedFilter,
        // activeQuestId NOT persisted — reset on app restart
      }),
    },
  ),
);
