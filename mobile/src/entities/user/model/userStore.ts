/**
 * entities/user/model/userStore.ts
 * Zustand store for user profile — persisted to AsyncStorage
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UserState, UserProfile, UserLevel } from './types';

const LEVEL_THRESHOLDS = [0, 500, 1200, 2500, 5000, 10000];
const LEVEL_TITLES: UserLevel[] = ['Seedling', 'Sprout', 'Sapling', 'Guardian', 'Elder', 'Legend'];

function computeLevel(xp: number): { level: number; levelTitle: UserLevel } {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= (LEVEL_THRESHOLDS[i] ?? 0)) {
      level = i + 1;
      break;
    }
  }
  return { level, levelTitle: LEVEL_TITLES[level - 1] ?? 'Legend' };
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      profile: null,
      isLoading: false,

      setProfile: (profile) => set({ profile }),

      updateXP: (xpGained) => {
        const { profile } = get();
        if (!profile) return;
        const newXP = profile.xp + xpGained;
        const { level, levelTitle } = computeLevel(newXP);
        set({ profile: { ...profile, xp: newXP, level, levelTitle } });
      },

      incrementStreak: () => {
        const { profile } = get();
        if (!profile) return;
        const today = new Date().setHours(0, 0, 0, 0);
        const lastActive = new Date(profile.lastActiveAt).setHours(0, 0, 0, 0);
        const dayDiff = (today - lastActive) / (1000 * 60 * 60 * 24);

        const newStreak = dayDiff === 1 ? profile.streak + 1 : dayDiff === 0 ? profile.streak : 1;
        set({ profile: { ...profile, streak: newStreak, lastActiveAt: Date.now() } });
      },

      reset: () => set({ profile: null }),
    }),
    {
      name: 'ecoquest-user',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
