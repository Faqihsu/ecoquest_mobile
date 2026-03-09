/**
 * hooks/useEcoPoints.ts
 *
 * ECO Points system — stored locally per wallet in AsyncStorage.
 * Future: convertible to ECO token on mainnet.
 */

import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

function ecoKey(wallet: string | null) {
  return `@ecoquest:eco_points:${wallet ?? "demo"}`;
}

export function useEcoPoints(walletAddress: string | null) {
  const [ecoPoints, setEcoPoints] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ecoKey(walletAddress));
        setEcoPoints(raw ? parseInt(raw, 10) : 0);
      } catch {
        setEcoPoints(0);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [walletAddress]);

  const addPoints = useCallback(
    async (amount: number) => {
      const next = ecoPoints + amount;
      setEcoPoints(next);
      try {
        await AsyncStorage.setItem(ecoKey(walletAddress), String(next));
      } catch {}
      return next;
    },
    [walletAddress, ecoPoints]
  );

  const resetPoints = useCallback(async () => {
    setEcoPoints(0);
    await AsyncStorage.removeItem(ecoKey(walletAddress));
  }, [walletAddress]);

  return { ecoPoints, isLoading, addPoints, resetPoints };
}
