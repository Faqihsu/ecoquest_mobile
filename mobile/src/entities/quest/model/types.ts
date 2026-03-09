/**
 * entities/quest/model/types.ts
 */
export type QuestDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Legendary';
export type QuestCategory = 'Pantai' | 'Hutan' | 'Kota' | 'Sepeda' | 'Air';
export type QuestStatus = 'available' | 'active' | 'completed' | 'expired';

export interface QuestLocation {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: QuestDifficulty;
  status: QuestStatus;
  rewardSkr: number;
  hasNftReward: boolean;
  location: QuestLocation;
  distanceKm?: number;
  slotsTotal: number;
  slotsFilled: number;
  expiresAt: number; // Unix timestamp
  onChainAddress?: string;
}

export interface QuestState {
  quests: Quest[];
  activeQuestId: string | null;
  selectedFilter: QuestCategory | 'Semua';

  // Actions
  setQuests: (quests: Quest[]) => void;
  setActiveQuest: (id: string | null) => void;
  setFilter: (filter: QuestCategory | 'Semua') => void;
}
