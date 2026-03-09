/**
 * hooks/useNetworkStatus.ts — Real-Time Network Connectivity Monitor
 *
 * Uses @react-native-community/netinfo to detect online/offline transitions.
 * Provides reactive state for UI indicators and triggers sync on reconnect.
 *
 * Usage:
 *   const { isOnline, networkType, isWifi } = useNetworkStatus();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NetworkStatus {
  /** Whether the device has internet connectivity */
  isOnline: boolean;
  /** Network type: wifi, cellular, ethernet, none, unknown */
  networkType: string;
  /** True if connected via WiFi */
  isWifi: boolean;
  /** True if connected via cellular */
  isCellular: boolean;
  /** Whether connectivity status has been determined */
  isReady: boolean;
}

// ── Event Emitter for non-React consumers ─────────────────────────────────────

type NetworkListener = (isOnline: boolean) => void;
const _listeners: Set<NetworkListener> = new Set();
let _lastOnlineState = true;

/**
 * Subscribe to online/offline transitions.
 * Useful for services that need to react to network changes
 * outside of React components (e.g., cloudSyncService).
 *
 * @returns Unsubscribe function
 */
export function onNetworkChange(listener: NetworkListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function emitNetworkChange(isOnline: boolean): void {
  if (isOnline !== _lastOnlineState) {
    _lastOnlineState = isOnline;
    _listeners.forEach((fn) => fn(isOnline));
  }
}

/**
 * Check current network status synchronously (cached value).
 */
export function isCurrentlyOnline(): boolean {
  return _lastOnlineState;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    networkType: 'unknown',
    isWifi: false,
    isCellular: false,
    isReady: false,
  });

  useEffect(() => {
    const handleChange = (state: NetInfoState) => {
      const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
      const networkType = state.type ?? 'unknown';

      setStatus({
        isOnline,
        networkType,
        isWifi: state.type === NetInfoStateType.wifi,
        isCellular: state.type === NetInfoStateType.cellular,
        isReady: true,
      });

      emitNetworkChange(isOnline);
    };

    // Get initial state
    NetInfo.fetch().then(handleChange);

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener(handleChange);

    return () => unsubscribe();
  }, []);

  return status;
}
