/**
 * entities/user/model/types.ts
 */
export type UserLevel = 'Seedling' | 'Sprout' | 'Sapling' | 'Guardian' | 'Elder' | 'Legend';

export interface UserProfile {
  publicKey: string;
  username: string;
  level: number;
  levelTitle: UserLevel;
  xp: number;
  questsCompleted: number;
  streak: number;
  lastActiveAt: number;
}

export interface UserState {
  profile: UserProfile | null;
  isLoading: boolean;

  setProfile: (profile: UserProfile) => void;
  updateXP: (xpGained: number) => void;
  incrementStreak: () => void;
  reset: () => void;
}
