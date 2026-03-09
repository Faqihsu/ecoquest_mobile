/**
 * shared/api/solana.ts
 *
 * Solana Connection — delegates to rpcConnection.ts failover manager.
 *
 * For backward compatibility, getConnection() returns synchronously
 * (using the cached connection). For failover-aware usage, prefer
 * getConnectionAsync() or withRpcFailover().
 */
import { Connection, clusterApiUrl, type Cluster } from '@solana/web3.js';
import { SOLANA_CLUSTER, SOLANA_RPC_URL, RPC_ENDPOINTS } from '../config/constants';
import {
  getConnection as getFailoverConnection,
  withRpcFailover,
  getCurrentProvider,
} from '../lib/rpcConnection';

// ── Synchronous fallback (for code that can't await) ──────────────────────────

let _syncConnection: Connection | null = null;

export function getConnection(): Connection {
  if (!_syncConnection) {
    const endpoint = SOLANA_RPC_URL ?? RPC_ENDPOINTS[0] ?? clusterApiUrl(SOLANA_CLUSTER as Cluster);
    _syncConnection = new Connection(endpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60_000,
    });
  }
  return _syncConnection;
}

// ── Async failover-aware connection ───────────────────────────────────────────

/**
 * Get a connection through the failover manager.
 * Probes endpoints and returns the first healthy one.
 */
export async function getConnectionAsync(): Promise<Connection> {
  return getFailoverConnection();
}

/** Reset singleton — useful for cluster switching in dev */
export function resetConnection(): void {
  _syncConnection = null;
}

// Re-export failover utilities for convenience
export { withRpcFailover, getCurrentProvider };
