/**
 * hooks/useProfile.ts
 *
 * Manages user profile data stored locally in AsyncStorage:
 *   - username (custom display name)
 *   - avatarUri (local file path from image picker, or null)
 *
 * On-chain identity doesn't exist in Solana — we store profile
 * data locally and key it by wallet address for per-account isolation.
 */

import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface UserProfile {
  username: string;
  avatarUri: string | null;
}

const DEFAULT_PROFILE: UserProfile = {
  username: "",
  avatarUri: null,
};

function profileKey(walletAddress: string) {
  return `@ecoquest:profile:${walletAddress}`;
}

export function useProfile(walletAddress: string | null) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  // Load profile for this wallet
  useEffect(() => {
    if (!walletAddress) {
      setProfile(DEFAULT_PROFILE);
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(profileKey(walletAddress));
        if (raw) {
          setProfile(JSON.parse(raw));
        } else {
          setProfile(DEFAULT_PROFILE);
        }
      } catch {
        setProfile(DEFAULT_PROFILE);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [walletAddress]);

  const saveProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!walletAddress) return;
      const next = { ...profile, ...updates };
      setProfile(next);
      await AsyncStorage.setItem(profileKey(walletAddress), JSON.stringify(next));
    },
    [walletAddress, profile]
  );

  const updateUsername = useCallback(
    (username: string) => saveProfile({ username: username.trim() }),
    [saveProfile]
  );

  const updateAvatar = useCallback(
    (avatarUri: string | null) => saveProfile({ avatarUri }),
    [saveProfile]
  );

  /** Display name: custom username → truncated wallet → "EcoWarrior" */
  const displayName = (walletAddress: string | null) => {
    if (profile.username) return profile.username;
    if (walletAddress && walletAddress.length >= 8) {
      return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    }
    return "EcoWarrior";
  };

  return {
    profile,
    isLoading,
    displayName,
    updateUsername,
    updateAvatar,
    saveProfile,
  };
}
