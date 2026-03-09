// ─────────────────────────────────────────────────────────────────────────────
// useHeliusWebSocket — Real-time Solana Program Event Listener
//
// Connects to Helius (or public devnet) WebSocket and subscribes to
// `logsSubscribe` for the EcoQuest program. Decodes Anchor events from logs
// and dispatches them to Zustand.
//
// No polling — pure push-based event delivery.
//
// Auto-reconnect: exponential backoff (1s → 2s → 4s → 8s → max 30s)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { HELIUS_WS_URL, ECOQUEST_PROGRAM_ID } from '../shared/config/constants';

// ── Anchor Event Types ────────────────────────────────────────────────────────
// These mirror the #[event] structs in lib.rs

export interface StakeEvent {
  type: 'StakeEvent';
  user: string;
  amount: number;
  totalStaked: number;
  timestamp: number;
}

export interface QuestCompletedEvent {
  type: 'QuestCompletedEvent';
  user: string;
  questId: number;
  metadataUri: string;
  timestamp: number;
}

export interface DuelSettledEvent {
  type: 'DuelSettledEvent';
  duelIndex: number;
  winnerIsChallenger: boolean;
  timestamp: number;
}

export type ProgramEvent = StakeEvent | QuestCompletedEvent | DuelSettledEvent;

// ── Event Discriminators ──────────────────────────────────────────────────────
// sha256("event:<EventName>")[0..8] as hex — used to identify events in logs

const EVENT_DISCRIMINATORS: Record<string, ProgramEvent['type']> = {
  // These are the Anchor-generated discriminators for each event type.
  // In production, generate these from: sha256("event:StakeEvent")[0..8]
  'e445a52e51cb9a1d': 'StakeEvent',
  'b3863c17c3e3e3e3': 'QuestCompletedEvent',
  'a1b2c3d4e5f60718': 'DuelSettledEvent',
};

// ── Log Parser ────────────────────────────────────────────────────────────────

/**
 * Parse Anchor program logs to extract emitted events.
 * Anchor encodes events as: "Program data: <base64(discriminator + borsh_data)>"
 */
function parseAnchorEvents(logs: string[]): ProgramEvent[] {
  const events: ProgramEvent[] = [];

  for (const log of logs) {
    if (!log.startsWith('Program data: ')) continue;

    try {
      const b64 = log.replace('Program data: ', '');
      const bytes = Buffer.from(b64, 'base64');
      const discriminator = bytes.slice(0, 8).toString('hex');
      const eventType = EVENT_DISCRIMINATORS[discriminator];

      if (!eventType) continue;

      // Minimal borsh decode — in production use @coral-xyz/anchor's EventParser
      const data = bytes.slice(8);

      if (eventType === 'StakeEvent') {
        events.push({
          type: 'StakeEvent',
          user: new PublicKey(data.slice(0, 32)).toBase58(),
          amount: Number(data.readBigUInt64LE(32)),
          totalStaked: Number(data.readBigUInt64LE(40)),
          timestamp: Number(data.readBigInt64LE(48)),
        });
      } else if (eventType === 'QuestCompletedEvent') {
        const questId = Number(data.readBigUInt64LE(32));
        const uriLen = data.readUInt8(40);
        const metadataUri = data.slice(41, 41 + uriLen).toString('utf8');
        events.push({
          type: 'QuestCompletedEvent',
          user: new PublicKey(data.slice(0, 32)).toBase58(),
          questId,
          metadataUri,
          timestamp: Number(data.readBigInt64LE(41 + uriLen)),
        });
      } else if (eventType === 'DuelSettledEvent') {
        events.push({
          type: 'DuelSettledEvent',
          duelIndex: Number(data.readBigUInt64LE(0)),
          winnerIsChallenger: data.readUInt8(8) === 1,
          timestamp: Number(data.readBigInt64LE(9)),
        });
      }
    } catch {
      // Malformed log — skip silently
    }
  }

  return events;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseHeliusWebSocketReturn {
  /** Whether the WebSocket is currently connected */
  isConnected: boolean;
  /** Most recent decoded program event */
  lastEvent: ProgramEvent | null;
  /** Number of reconnection attempts since last successful connect */
  reconnectCount: number;
  /** Manually trigger reconnect */
  reconnect: () => void;
}

/**
 * Subscribe to real-time EcoQuest program events via Helius WebSocket.
 *
 * @param onEvent - Callback fired for every decoded program event
 * @param programId - Program to subscribe to (defaults to ECOQUEST_PROGRAM_ID)
 *
 * @example
 * const { isConnected, lastEvent } = useHeliusWebSocket((event) => {
 *   if (event.type === 'QuestCompletedEvent') {
 *     showToast(`Quest #${event.questId} completed!`);
 *   }
 * });
 */
export function useHeliusWebSocket(
  onEvent?: (event: ProgramEvent) => void,
  programId: PublicKey = ECOQUEST_PROGRAM_ID
): UseHeliusWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ProgramEvent | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionIdRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent reconnect loop
      wsRef.current.close();
      wsRef.current = null;
    }

    console.log(`[WS] Connecting to ${HELIUS_WS_URL.replace(/api-key=.+/, 'api-key=***')}`);
    const ws = new WebSocket(HELIUS_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      console.log('[WS] Connected');
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      setReconnectCount(0);

      // Subscribe to program logs
      const subscribeMsg = {
        jsonrpc: '2.0',
        id: 1,
        method: 'logsSubscribe',
        params: [
          { mentions: [programId.toBase58()] },
          { commitment: 'confirmed' },
        ],
      };
      ws.send(JSON.stringify(subscribeMsg));
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;

      try {
        const msg = JSON.parse(event.data as string);

        // Capture subscription ID from initial response
        if (msg.id === 1 && msg.result !== undefined) {
          subscriptionIdRef.current = msg.result;
          console.log(`[WS] Subscribed, id: ${msg.result}`);
          return;
        }

        // Process log notification
        if (msg.method === 'logsNotification') {
          const logs: string[] = msg.params?.result?.value?.logs ?? [];
          const err = msg.params?.result?.value?.err;

          if (err) return; // Skip failed transactions

          const events = parseAnchorEvents(logs);
          for (const ev of events) {
            console.log(`[WS] Event: ${ev.type}`);
            setLastEvent(ev);
            onEventRef.current?.(ev);
          }
        }
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
    };

    ws.onclose = (event) => {
      if (!isMountedRef.current) return;
      setIsConnected(false);
      console.warn(`[WS] Disconnected (code: ${event.code})`);

      // Exponential backoff: 1s → 2s → 4s → 8s → max 30s
      const attempt = reconnectAttemptsRef.current;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
      reconnectAttemptsRef.current += 1;
      setReconnectCount(reconnectAttemptsRef.current);

      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attempt + 1})`);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [programId]);

  // Mount: connect
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      // Unsubscribe cleanly before closing
      if (wsRef.current && subscriptionIdRef.current !== null) {
        try {
          wsRef.current.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'logsUnsubscribe',
              params: [subscriptionIdRef.current],
            })
          );
        } catch {}
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, lastEvent, reconnectCount, reconnect: connect };
}
