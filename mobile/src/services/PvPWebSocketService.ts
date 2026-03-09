// ─────────────────────────────────────────────────────────────────────────────
// PvP WebSocket Service
//
// Manages real-time PvP duel state via WebSocket.
// Uses Helius devnet WebSocket endpoint for Solana account subscriptions,
// plus a lightweight signaling layer for matchmaking.
//
// Events emitted:
//   duel_created   — a new duel was posted to the arena
//   duel_accepted  — someone accepted a duel (match found)
//   battle_result  — on-chain settlement confirmed
//   connection     — ws connected/disconnected
// ─────────────────────────────────────────────────────────────────────────────

import Constants from 'expo-constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Duel {
  id: string;
  challenger: string;       // Base58 wallet address
  challengerAlias: string;  // Display name (truncated)
  challengerWins: number;
  stake: number;            // SKR amount
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: number;        // unix ms
}

export interface BattleResult {
  duelId: string;
  winner: string;
  loser: string;
  reward: number;
  txSignature: string;
}

export type PvPEvent =
  | { type: 'duel_created'; payload: Duel }
  | { type: 'duel_accepted'; payload: { duelId: string; acceptor: string } }
  | { type: 'battle_result'; payload: BattleResult }
  | { type: 'connection'; payload: { status: 'connected' | 'disconnected' | 'reconnecting' } };

type EventCallback = (event: PvPEvent) => void;

// ── Config ────────────────────────────────────────────────────────────────────

const HELIUS_API_KEY =
  (Constants.expoConfig?.extra?.HELIUS_API_KEY as string) ?? '';

// Helius devnet WebSocket endpoint for Solana account / log subscriptions
const HELIUS_WS =
  HELIUS_API_KEY
    ? `wss://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'wss://api.devnet.solana.com';

// PvP program account to watch (same as PROGRAM_ID in constants.ts)
const PVP_PROGRAM_ID = '4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

// ── Seed data for devnet demo duels (fallback when ws not yet subscribed) ────

export const SEED_DUELS: Duel[] = [
  {
    id: 'seed-1',
    challenger: 'MetaHunt...er42',
    challengerAlias: 'MetaHunter',
    challengerWins: 23,
    stake: 500,
    difficulty: 'medium',
    createdAt: Date.now() - 300_000,
  },
  {
    id: 'seed-2',
    challenger: 'EcoWarr...or99',
    challengerAlias: 'EcoWarrior',
    challengerWins: 45,
    stake: 1000,
    difficulty: 'hard',
    createdAt: Date.now() - 120_000,
  },
  {
    id: 'seed-3',
    challenger: 'NatureG...rd08',
    challengerAlias: 'NatureGuard',
    challengerWins: 8,
    stake: 250,
    difficulty: 'easy',
    createdAt: Date.now() - 60_000,
  },
];

// ── Service ───────────────────────────────────────────────────────────────────

export class PvPWebSocketService {
  private ws: WebSocket | null = null;
  private subscriptionId: number | null = null;
  private listeners: EventCallback[] = [];
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Start listening to on-chain PvP events */
  connect(): void {
    this.shouldReconnect = true;
    this._openConnection();
  }

  /** Stop WebSocket and clean up */
  disconnect(): void {
    this.shouldReconnect = false;
    this._cleanup();
    this._emit({ type: 'connection', payload: { status: 'disconnected' } });
  }

  /** Register an event listener */
  on(callback: EventCallback): () => void {
    this.listeners.push(callback);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Post a new duel to the arena.
   * In a real deployment this would call the PvP Anchor program.
   * For devnet demo we broadcast the duel via the WS subscription message.
   */
  createDuel(duel: Omit<Duel, 'id' | 'createdAt'>): void {
    const newDuel: Duel = {
      ...duel,
      id: `duel-${Date.now()}`,
      createdAt: Date.now(),
    };
    // Optimistic local broadcast
    this._emit({ type: 'duel_created', payload: newDuel });
    // In production: send Anchor instruction via MWA, then WS picks up the event
  }

  /**
   * Accept an existing duel.
   * For devnet: optimistic broadcast + simulated battle result after 3 seconds.
   */
  acceptDuel(duelId: string, acceptorAddress: string): void {
    this._emit({ type: 'duel_accepted', payload: { duelId, acceptor: acceptorAddress } });

    // Simulate battle settlement on devnet (replace with real on-chain listener)
    setTimeout(() => {
      const playerWon = Math.random() > 0.5;
      this._emit({
        type: 'battle_result',
        payload: {
          duelId,
          winner: playerWon ? acceptorAddress : 'opponent',
          loser: playerWon ? 'opponent' : acceptorAddress,
          reward: Math.floor(Math.random() * 500) + 250,
          txSignature: `sim-${Date.now()}`,
        },
      });
    }, 3000);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _openConnection(): void {
    try {
      this.ws = new WebSocket(HELIUS_WS);

      this.ws.onopen = () => {
        console.log('[PvP WS] Connected to', HELIUS_WS);
        this.reconnectAttempts = 0;
        this._emit({ type: 'connection', payload: { status: 'connected' } });

        // Subscribe to logs for the PvP program (Solana RPC method)
        this._send({
          jsonrpc: '2.0',
          id: 1,
          method: 'logsSubscribe',
          params: [
            { mentions: [PVP_PROGRAM_ID] },
            { commitment: 'confirmed' },
          ],
        });

        // Heartbeat ping every 20s to keep WS alive
        this.heartbeatTimer = setInterval(() => {
          this._send({ jsonrpc: '2.0', id: 99, method: 'ping', params: [] });
        }, 20_000);
      };

      this.ws.onmessage = (msg) => {
        this._handleMessage(msg.data as string);
      };

      this.ws.onerror = (err) => {
        console.warn('[PvP WS] Error:', err);
      };

      this.ws.onclose = () => {
        console.log('[PvP WS] Disconnected');
        this._clearHeartbeat();
        if (this.shouldReconnect && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++;
          this._emit({ type: 'connection', payload: { status: 'reconnecting' } });
          setTimeout(() => this._openConnection(), RECONNECT_DELAY_MS * this.reconnectAttempts);
        } else {
          this._emit({ type: 'connection', payload: { status: 'disconnected' } });
        }
      };
    } catch (err) {
      console.error('[PvP WS] Failed to open connection:', err);
    }
  }

  private _handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      // Save subscription ID
      if (msg.id === 1 && msg.result !== undefined) {
        this.subscriptionId = msg.result;
        console.log('[PvP WS] Subscribed, id:', this.subscriptionId);
        return;
      }

      // Handle logsNotification
      if (msg.method === 'logsNotification') {
        const logs: string[] = msg.params?.result?.value?.logs ?? [];
        this._parsePvPLogs(logs, msg.params?.result?.value?.signature ?? '');
      }
    } catch {
      // Non-JSON message (ping reply etc.) — ignore
    }
  }

  /** Parse Anchor program logs to extract PvP events */
  private _parsePvPLogs(logs: string[], txSignature: string): void {
    for (const log of logs) {
      if (log.includes('DuelCreated')) {
        // In production parse the actual account data; here we trigger a demo duel
        this._emit({
          type: 'duel_created',
          payload: {
            id: `chain-${txSignature.slice(0, 8)}`,
            challenger: txSignature.slice(0, 8) + '...',
            challengerAlias: 'On-Chain Player',
            challengerWins: 0,
            stake: 300,
            difficulty: 'medium',
            createdAt: Date.now(),
          },
        });
      }

      if (log.includes('DuelSettled') || log.includes('BattleResult')) {
        this._emit({
          type: 'battle_result',
          payload: {
            duelId: txSignature.slice(0, 8),
            winner: 'chain-winner',
            loser: 'chain-loser',
            reward: 500,
            txSignature,
          },
        });
      }
    }
  }

  private _send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private _emit(event: PvPEvent): void {
    this.listeners.forEach((cb) => cb(event));
  }

  private _clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _cleanup(): void {
    this._clearHeartbeat();
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
  }
}

// Singleton instance
export const pvpWebSocketService = new PvPWebSocketService();
