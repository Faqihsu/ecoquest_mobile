/**
 * entities/wallet/model/useWalletState.ts
 *
 * Global convenience hook — call from ANY screen to check wallet status.
 *
 * Usage:
 *   const { isConnected, publicKey, walletName, disconnect } = useWalletState();
 */
import { useWalletStore } from './walletStore';

/**
 * Read-only wallet state + disconnect action.
 * Optimized selector to prevent unnecessary re-renders.
 */
export function useWalletState() {
  const status = useWalletStore((s) => s.status);
  const publicKey = useWalletStore((s) => s.publicKey);
  const walletName = useWalletStore((s) => s.walletName);
  const isDemoMode = useWalletStore((s) => s.isDemoMode);
  const disconnect = useWalletStore((s) => s.disconnect);

  return {
    /** Current connection status: 'disconnected' | 'connecting' | 'connected' */
    status,
    /** Whether the wallet is connected (shorthand for status === 'connected') */
    isConnected: status === 'connected',
    /** Whether a connection attempt is in progress */
    isConnecting: status === 'connecting',
    /** Base58-encoded Solana public key, or null */
    publicKey,
    /** Detected wallet name, or null */
    walletName,
    /** Whether running in demo mode (no real wallet) */
    isDemoMode,
    /** Clean disconnect — wipes SecureStore and resets state */
    disconnect,
  } as const;
}
