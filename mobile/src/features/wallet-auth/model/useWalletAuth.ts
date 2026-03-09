/**
 * features/wallet-auth/model/useWalletAuth.ts
 * Feature: Connect / disconnect wallet with UI state management
 *
 * Delegates to useMobileWallet for MWA operations
 * and reads state from the Zustand walletStore.
 */
import { useCallback, useState } from 'react';

import { useMobileWallet } from '../../../shared/lib/mwa/useMobileWallet';
import { useWalletStore } from '../../../entities/wallet/model/walletStore';

export function useWalletAuth() {
  const [error, setError] = useState<string | null>(null);
  const { connect, disconnect } = useMobileWallet();

  const status = useWalletStore((s) => s.status);
  const publicKey = useWalletStore((s) => s.publicKey);
  const isDemoMode = useWalletStore((s) => s.isDemoMode);

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      await connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
    }
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    setError(null);
    await disconnect();
  }, [disconnect]);

  return {
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    isDemoMode,
    publicKey,
    error,
    connect: handleConnect,
    disconnect: handleDisconnect,
  };
}
