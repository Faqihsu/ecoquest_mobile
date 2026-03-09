/**
 * useRpcStatus — React hook for RPC connection status UI feedback.
 *
 * Subscribes to the rpcConnection status event system and provides:
 *   - status: 'connected' | 'reconnecting' | 'error'
 *   - provider: 'Helius' | 'Triton' | 'QuickNode' | 'Public Devnet'
 *   - message: Human-readable status message
 *
 * Usage in StakingScreen / any screen:
 *   const { status, provider, message } = useRpcStatus();
 *   {status === 'reconnecting' && <ReconnectingBanner provider={provider} />}
 */

import { useState, useEffect } from 'react';
import {
  onRpcStatusChange,
  type RpcStatus,
  type RpcStatusEvent,
} from '../shared/lib/rpcConnection';

interface RpcStatusState {
  status: RpcStatus;
  provider: string;
  message: string;
}

export function useRpcStatus(): RpcStatusState {
  const [state, setState] = useState<RpcStatusState>({
    status: 'connected',
    provider: '',
    message: '',
  });

  useEffect(() => {
    const unsubscribe = onRpcStatusChange((event: RpcStatusEvent) => {
      setState({
        status: event.status,
        provider: event.provider,
        message: event.message,
      });
    });

    return unsubscribe;
  }, []);

  return state;
}
