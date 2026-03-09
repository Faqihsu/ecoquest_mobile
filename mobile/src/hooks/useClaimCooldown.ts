/**
 * hooks/useClaimCooldown.ts — Client-Side Claim Cooldown Guard
 *
 * Prevents rapid re-claims by enforcing a 60-second cooldown
 * between staking reward claims (client-side).
 *
 * WARNING: This is a UI guard only. The Anchor smart contract MUST
 * also enforce cooldown via `last_claim_at` timestamp validation.
 *
 * Usage:
 *   const { canClaim, remainingSeconds, recordClaim } = useClaimCooldown();
 *   if (!canClaim) showCooldownUI(remainingSeconds);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COOLDOWN_KEY = '@ecoquest:last_claim_at';
const COOLDOWN_SECONDS = 60;

export function useClaimCooldown() {
  const [lastClaimAt, setLastClaimAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load last claim timestamp
  useEffect(() => {
    AsyncStorage.getItem(COOLDOWN_KEY).then((val) => {
      if (val) setLastClaimAt(parseInt(val, 10));
    });
  }, []);

  // Countdown timer
  useEffect(() => {
    const tick = () => {
      if (!lastClaimAt) {
        setRemainingSeconds(0);
        return;
      }
      const elapsed = (Date.now() - lastClaimAt) / 1000;
      const remaining = Math.max(0, COOLDOWN_SECONDS - elapsed);
      setRemainingSeconds(Math.ceil(remaining));
    };

    tick(); // Initial
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lastClaimAt]);

  const canClaim = remainingSeconds === 0;

  /**
   * Record a successful claim — starts the cooldown timer.
   */
  const recordClaim = useCallback(async () => {
    const now = Date.now();
    setLastClaimAt(now);
    await AsyncStorage.setItem(COOLDOWN_KEY, now.toString());
  }, []);

  /**
   * Reset cooldown (for testing/admin).
   */
  const resetCooldown = useCallback(async () => {
    setLastClaimAt(null);
    setRemainingSeconds(0);
    await AsyncStorage.removeItem(COOLDOWN_KEY);
  }, []);

  return {
    /** Whether user can claim right now */
    canClaim,
    /** Seconds remaining before next claim */
    remainingSeconds,
    /** Last claim timestamp (unix ms) */
    lastClaimAt,
    /** Call after successful claim to start cooldown */
    recordClaim,
    /** Reset cooldown (admin/testing) */
    resetCooldown,
    /** Cooldown duration in seconds */
    cooldownDuration: COOLDOWN_SECONDS,
  };
}
