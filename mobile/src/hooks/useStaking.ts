// ─────────────────────────────────────────────────────────────────────────────
// useStaking — React Hook wrapping AnchorStakingService
//
// Provides:
//   - stake(amount): Stake SKR via Anchor program
//   - unstake(amount): Unstake SKR
//   - claimRewards(): Claim accumulated rewards
//   - initStaker(): One-time staker account initialization
//   - stakerInfo: On-chain staker data (via React Query)
//   - isPending: Whether any staking tx is in-flight
//
// Integrates with:
//   - AnchorStakingService (transaction building + simulation)
//   - useMobileWallet (MWA signing)
//   - useSolanaTransaction (lifecycle + Zustand state)
//   - useHeliusWebSocket (real-time stake events)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  transact,
  Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { useQueryClient } from '@tanstack/react-query';

import {
  stakingService,
  StakingTransactionError,
  SignTransactionFn,
} from '../services/StakingService';
import { useHeliusWebSocket, StakeEvent } from './useHeliusWebSocket';
import { MWA_CONFIG } from '../shared/config/mwa';
import { SKR_DECIMALS } from '../shared/config/constants';
import { useWalletStore } from '../entities/wallet/model/walletStore';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StakingContext {
  userPublicKey: PublicKey;
  userTokenAccount: PublicKey;
}

export interface UseStakingReturn {
  /** Stake SKR tokens (amount in human units, e.g. 100 = 100 SKR) */
  stake: (amount: number, ctx: StakingContext) => Promise<string>;

  /** Unstake SKR tokens (amount in human units) */
  unstake: (amount: number, ctx: StakingContext) => Promise<string>;

  /** Claim accumulated staking rewards */
  claimRewards: (ctx: Pick<StakingContext, 'userPublicKey'>) => Promise<string>;

  /** Initialize staker account (one-time) */
  initStaker: (userPublicKey: PublicKey) => Promise<string>;

  /** Check if staker account exists */
  hasStakerAccount: (userPublicKey: PublicKey) => Promise<boolean>;

  /** Whether any staking tx is currently in-flight */
  isPending: boolean;

  /** Last error message, if any */
  lastError: string | null;
}

// ── MWA Sign Helper ─────────────────────────────────────────────────────────

/**
 * Creates an MWA-compatible sign function that opens a wallet session,
 * reauthorizes (with stored token), and signs the transaction.
 *
 * Uses reauthorize first to avoid wallet pop-ups. Falls back to
 * authorize only if the token is expired/missing.
 */
function createMwaSignFn(): SignTransactionFn {
  const authToken = useWalletStore.getState().authToken;
  return async (transaction: Transaction): Promise<Transaction> => {
    return await transact(async (wallet: Web3MobileWallet) => {
      // Try reauthorize first (no pop-up), fall back to authorize
      try {
        if (authToken) {
          await wallet.reauthorize({
            auth_token: authToken,
            identity: MWA_CONFIG.appIdentity,
          });
        } else {
          throw new Error('No auth token — fall through to authorize');
        }
      } catch {
        await wallet.authorize({
          cluster: MWA_CONFIG.cluster,
          identity: MWA_CONFIG.appIdentity,
        });
      }

      // Sign transaction(s)
      const signedTransactions = await wallet.signTransactions({
        transactions: [transaction],
      });

      return signedTransactions[0];
    });
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStaking(): UseStakingReturn {
  const [isPending, setIsPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  /** Invalidate balance + staker queries after successful tx */
  const invalidateBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['solana'] });
    queryClient.invalidateQueries({ queryKey: ['staker'] });
  }, [queryClient]);

  const stake = useCallback(
    async (amount: number, ctx: StakingContext): Promise<string> => {
      setIsPending(true);
      setLastError(null);
      try {
        const signFn = createMwaSignFn();
        const signature = await stakingService.stakeSkr({
          userPublicKey: ctx.userPublicKey,
          userTokenAccount: ctx.userTokenAccount,
          amount,
          signTransaction: signFn,
        });
        invalidateBalances();
        return signature;
      } catch (err) {
        const msg =
          err instanceof StakingTransactionError
            ? `[${err.phase}] ${err.message}`
            : err instanceof Error
              ? err.message
              : 'Unknown staking error';
        setLastError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [invalidateBalances],
  );

  const unstake = useCallback(
    async (amount: number, ctx: StakingContext): Promise<string> => {
      setIsPending(true);
      setLastError(null);
      try {
        const signFn = createMwaSignFn();
        const signature = await stakingService.unstakeSkr({
          userPublicKey: ctx.userPublicKey,
          userTokenAccount: ctx.userTokenAccount,
          amount,
          signTransaction: signFn,
        });
        invalidateBalances();
        return signature;
      } catch (err) {
        const msg =
          err instanceof StakingTransactionError
            ? `[${err.phase}] ${err.message}`
            : err instanceof Error
              ? err.message
              : 'Unknown unstaking error';
        setLastError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [invalidateBalances],
  );

  const claimRewards = useCallback(
    async (ctx: Pick<StakingContext, 'userPublicKey'>): Promise<string> => {
      setIsPending(true);
      setLastError(null);
      try {
        const signFn = createMwaSignFn();
        const signature = await stakingService.claimRewards({
          userPublicKey: ctx.userPublicKey,
          signTransaction: signFn,
        });
        invalidateBalances();
        return signature;
      } catch (err) {
        const msg =
          err instanceof StakingTransactionError
            ? `[${err.phase}] ${err.message}`
            : err instanceof Error
              ? err.message
              : 'Unknown claim error';
        setLastError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [invalidateBalances],
  );

  const initStaker = useCallback(
    async (userPublicKey: PublicKey): Promise<string> => {
      setIsPending(true);
      setLastError(null);
      try {
        const signFn = createMwaSignFn();
        const signature = await stakingService.initializeStaker({
          userPublicKey,
          signTransaction: signFn,
        });
        return signature;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to initialize staker';
        setLastError(msg);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  const hasStakerAccount = useCallback(
    async (userPublicKey: PublicKey): Promise<boolean> => {
      return stakingService.hasStakerAccount(userPublicKey);
    },
    [],
  );

  return {
    stake,
    unstake,
    claimRewards,
    initStaker,
    hasStakerAccount,
    isPending,
    lastError,
  };
}

// ── Staking Event Subscription ────────────────────────────────────────────────

/**
 * Subscribe to real-time StakeEvent from the program.
 *
 * @example
 * useStakingEvents((event) => {
 *   updateStakedBalance(event.totalStaked);
 * });
 */
export function useStakingEvents(onStake?: (event: StakeEvent) => void) {
  return useHeliusWebSocket((event) => {
    if (event.type === 'StakeEvent') {
      onStake?.(event);
    }
  });
}
