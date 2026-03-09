// ─────────────────────────────────────────────────────────────────────────────
// RPC Connection Manager — Failover Logic
//
// Priority: Helius → Triton → QuickNode → public devnet
//
// Failover triggers:
//   • HTTP 429 (Too Many Requests) — auto-switch to next provider
//   • Request timeout (>8s)        — auto-switch to next provider
//   • Connection error / DNS fail  — auto-switch to next provider
//   • Health-check fail on init    — skip to next provider
//
// Status events:
//   Emits 'connected' / 'reconnecting' / 'error' for UI feedback
//   (used by useRpcStatus hook for "Reconnecting..." banner)
//
// Strategy:
//   - Wrap fetch() in Connection to intercept 429 / timeout
//   - On failure: invalidate cache → try next endpoint → emit status
//   - Cache healthy connection for 60s before re-probing
// ─────────────────────────────────────────────────────────────────────────────

import { Connection, ConnectionConfig } from '@solana/web3.js';
import { RPC_ENDPOINTS } from '../config/constants';

// ── Config ────────────────────────────────────────────────────────────────────

const HEALTH_CHECK_TIMEOUT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;
const MAX_RETRIES_PER_REQUEST = 2;

const CONNECTION_CONFIG: ConnectionConfig = {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true, // We handle retries ourselves
  confirmTransactionInitialTimeout: 60_000,
};

// ── Provider labels for logging / UI ──────────────────────────────────────────

function getProviderLabel(url: string): string {
  if (url.includes('helius')) return 'Helius';
  if (url.includes('rpcpool') || url.includes('triton')) return 'Triton';
  if (url.includes('quiknode') || url.includes('quicknode')) return 'QuickNode';
  if (url.includes('devnet.solana.com')) return 'Public Devnet';
  return 'Custom RPC';
}

// ── Status Event System ───────────────────────────────────────────────────────

export type RpcStatus = 'connected' | 'reconnecting' | 'error';

export interface RpcStatusEvent {
  status: RpcStatus;
  provider: string;
  /** URL (masked) of the current endpoint */
  endpoint: string;
  /** Human-readable message */
  message: string;
}

type StatusListener = (event: RpcStatusEvent) => void;

const listeners = new Set<StatusListener>();

export function onRpcStatusChange(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitStatus(status: RpcStatus, url: string, message: string): void {
  const event: RpcStatusEvent = {
    status,
    provider: getProviderLabel(url),
    endpoint: url.replace(/api-key=.+/, 'api-key=***').slice(0, 50),
    message,
  };
  listeners.forEach((fn) => {
    try { fn(event); } catch {}
  });
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface ConnectionCache {
  connection: Connection;
  url: string;
  urlIndex: number;
  checkedAt: number;
}

let cache: ConnectionCache | null = null;

// ── Health Check ──────────────────────────────────────────────────────────────

async function isHealthy(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const data = await response.json();
    return data?.result === 'ok' || response.ok;
  } catch {
    return false;
  }
}

// ── Fetch Wrapper with 429/Timeout detection ──────────────────────────────────

/**
 * Create a patched fetch function that detects:
 *   • HTTP 429 → throws RpcRateLimitError
 *   • Timeout   → throws RpcTimeoutError
 *   • Network   → throws generic Error
 */
function createRpcFetch(timeoutMs: number) {
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Merge any existing signal with our timeout signal
    const existingSignal = init?.signal;
    if (existingSignal) {
      existingSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429) {
        throw new RpcRateLimitError(
          `RPC 429 Too Many Requests from ${typeof url === 'string' ? getProviderLabel(url) : 'RPC'}`
        );
      }

      return response;
    } catch (err: any) {
      clearTimeout(timer);

      if (err instanceof RpcRateLimitError) throw err;

      if (err?.name === 'AbortError') {
        throw new RpcTimeoutError(
          `RPC timeout after ${timeoutMs}ms from ${typeof url === 'string' ? getProviderLabel(url) : 'RPC'}`
        );
      }

      throw err;
    }
  };
}

export class RpcRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RpcRateLimitError';
  }
}

export class RpcTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RpcTimeoutError';
  }
}

// ── Connection Factory ────────────────────────────────────────────────────────

function createConnection(url: string): Connection {
  return new Connection(url, {
    ...CONNECTION_CONFIG,
    fetch: createRpcFetch(REQUEST_TIMEOUT_MS),
  });
}

// ── Main Export: getConnection with auto-failover ─────────────────────────────

/**
 * Returns a healthy Solana Connection with auto-failover.
 *
 * On first call (or cache expired): probes endpoints in order.
 * If a request fails with 429/timeout mid-use, call `failoverToNext()`
 * to switch to the next provider.
 *
 * @throws Error if ALL RPC endpoints are unreachable
 */
export async function getConnection(): Promise<Connection> {
  const now = Date.now();

  // Return cached if fresh
  if (cache && now - cache.checkedAt < CACHE_TTL_MS) {
    return cache.connection;
  }

  // Probe from the beginning (or from last known good + 1 if recovering)
  const startIndex = cache ? cache.urlIndex : 0;
  return probeAndConnect(startIndex);
}

/**
 * Force failover to the next RPC provider.
 * Call this when a request fails with 429 or timeout.
 *
 * @returns New Connection from the next healthy provider
 * @throws Error if no more providers are available
 */
export async function failoverToNext(): Promise<Connection> {
  const currentIndex = cache?.urlIndex ?? -1;
  const nextIndex = (currentIndex + 1) % RPC_ENDPOINTS.length;

  // Don't loop forever — if we've tried all, throw
  if (nextIndex === 0 && currentIndex >= 0) {
    // Full circle — re-probe all from scratch
    emitStatus('error', cache?.url ?? '', 'All RPC providers exhausted. Retrying from start...');
  }

  const currentUrl = cache?.url ?? RPC_ENDPOINTS[0];
  cache = null;

  emitStatus('reconnecting', currentUrl, `Switching from ${getProviderLabel(currentUrl)}...`);

  return probeAndConnect(nextIndex);
}

async function probeAndConnect(startIndex: number): Promise<Connection> {
  const endpoints = RPC_ENDPOINTS;
  const total = endpoints.length;

  for (let i = 0; i < total; i++) {
    const idx = (startIndex + i) % total;
    const url = endpoints[idx];
    const label = getProviderLabel(url);

    const healthy = await isHealthy(url);
    if (healthy) {
      console.log(`[RPC] ✅ Connected to ${label}`);
      const connection = createConnection(url);
      cache = { connection, url, urlIndex: idx, checkedAt: Date.now() };
      emitStatus('connected', url, `Connected to ${label}`);
      return connection;
    }

    console.warn(`[RPC] ❌ ${label} unhealthy, trying next...`);
  }

  emitStatus('error', '', 'All RPC endpoints unreachable');
  throw new Error('[RPC] All Solana RPC endpoints are unreachable. Check your network connection.');
}

// ── Auto-retry wrapper ────────────────────────────────────────────────────────

/**
 * Execute a Solana RPC call with automatic failover on 429/timeout.
 *
 * Use this for critical operations (staking, NFT claims) where you want
 * seamless provider switching without the caller handling retries.
 *
 * @example
 * const balance = await withRpcFailover(async (conn) => {
 *   return conn.getBalance(pubkey);
 * });
 */
export async function withRpcFailover<T>(
  fn: (connection: Connection) => Promise<T>,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES_PER_REQUEST; attempt++) {
    try {
      const connection = await getConnection();
      return await fn(connection);
    } catch (err: any) {
      lastError = err;

      const isRetriable =
        err instanceof RpcRateLimitError ||
        err instanceof RpcTimeoutError ||
        err?.message?.includes('429') ||
        err?.message?.includes('timeout') ||
        err?.message?.includes('ECONNREFUSED') ||
        err?.message?.includes('fetch failed');

      if (isRetriable && attempt < MAX_RETRIES_PER_REQUEST) {
        console.warn(`[RPC] Retriable error (attempt ${attempt + 1}): ${err.message}`);
        await failoverToNext();
        continue;
      }

      throw err;
    }
  }

  throw lastError ?? new Error('[RPC] Failover exhausted');
}

// ── Legacy compat ─────────────────────────────────────────────────────────────

export function invalidateConnectionCache(): void {
  cache = null;
}

export function getCurrentRpcUrl(): string | null {
  return cache?.url ?? null;
}

export function getCurrentProvider(): string {
  return cache ? getProviderLabel(cache.url) : 'Not connected';
}
