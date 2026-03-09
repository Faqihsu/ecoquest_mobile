/**
 * hooks/usePaymasterStatus.ts — React hook for Paymaster / Newbie status
 *
 * Evaluates whether the current user qualifies for gasless transactions
 * and exposes the result reactively for UI feedback.
 *
 * Usage:
 *   const { isNewbie, shouldUseGasless, freeClaimsRemaining, label } = usePaymasterStatus();
 *   {shouldUseGasless && <Text>{label}</Text>}
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useQuests } from '../contexts/QuestContext';
import {
  evaluatePaymasterStatus,
  type PaymasterStatus,
} from '../services/paymasterMiddleware';

interface PaymasterHookResult extends PaymasterStatus {
  /** Human-friendly label for UI (e.g., "⚡ Free Transaction") */
  label: string;
  /** Re-evaluate the status (e.g., after a claim) */
  refresh: () => void;
  /** Whether evaluation is in progress */
  loading: boolean;
}

export function usePaymasterStatus(): PaymasterHookResult {
  const { publicKeyBase58 } = useWallet();
  const { userQuests } = useQuests();

  const [status, setStatus] = useState<PaymasterStatus>({
    isNewbie: false,
    newbieReason: '',
    freeClaimsRemaining: 0,
    freeClaimsUsed: 0,
    shouldUseGasless: false,
    insufficientSol: false,
  });
  const [loading, setLoading] = useState(true);

  const evaluate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await evaluatePaymasterStatus(publicKeyBase58, userQuests);
      setStatus(result);
    } catch (err) {
      console.warn('[usePaymasterStatus] Evaluation failed:', err);
    } finally {
      setLoading(false);
    }
  }, [publicKeyBase58, userQuests]);

  // Re-evaluate when wallet or quests change
  useEffect(() => {
    evaluate();
  }, [evaluate]);

  // Build UI label
  const label = useMemo(() => {
    if (!status.shouldUseGasless) return '';
    if (status.isNewbie) {
      return `⚡ Free Transaction (${status.freeClaimsRemaining} remaining)`;
    }
    if (status.insufficientSol) {
      return '⚡ Sponsored Transaction (low SOL)';
    }
    return '';
  }, [status]);

  return {
    ...status,
    label,
    refresh: evaluate,
    loading,
  };
}
