// ─────────────────────────────────────────────────────────────────────────────
// hooks — Public API
// ─────────────────────────────────────────────────────────────────────────────

// Zustand transaction store
export { useTransactionStore } from './useTransactionStore';
export type { TxRecord, TxStatus } from './useTransactionStore';

// Transaction lifecycle
export { useSolanaTransaction, SolanaTransactionError } from './useSolanaTransaction';
export type { MwaSignFn, SendTxOptions, SendTxResult } from './useSolanaTransaction';

// Helius WebSocket
export { useHeliusWebSocket } from './useHeliusWebSocket';
export type {
  ProgramEvent,
  StakeEvent,
  QuestCompletedEvent,
  DuelSettledEvent,
  UseHeliusWebSocketReturn,
} from './useHeliusWebSocket';

// Domain hooks
export { useQuestActions, useQuestEvents } from './useQuestActions';
export type { UseQuestActionsReturn } from './useQuestActions';

export { useStaking, useStakingEvents } from './useStaking';
export type { UseStakingReturn, StakingContext } from './useStaking';

// On-chain data (React Query)
export {
  useSolBalance,
  useSKRBalance,
  useNFTs,
  useOnChainData,
} from './useSolanaData';
export type {
  UseSolBalanceReturn,
  UseSKRBalanceReturn,
  UseNFTsReturn,
  UseOnChainDataReturn,
} from './useSolanaData';

// Gasless (sponsored) transaction layer
export { useGaslessTransaction } from './useGaslessTransaction';
export type { GaslessStage, GaslessResult } from './useGaslessTransaction';

export { useClaimEco } from './useClaimEco';

