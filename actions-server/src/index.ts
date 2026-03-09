/**
 * Solana Actions Server — EcoQuest SKR Staking Blink
 *
 * Endpoints:
 *   GET  /api/actions/stake-skr   → ActionGetResponse (metadata for Blink card)
 *   POST /api/actions/stake-skr   → ActionPostResponse (unsigned staking TX)
 *   GET  /actions.json            → Actions discovery (static file)
 *
 * When shared on X/Twitter, Dialect/Blink clients render the GET response
 * as an interactive card. Users can stake SKR one-click from their browser.
 */

import express from 'express';
import cors from 'cors';
import { stakeSkrAction } from './actions/stake-skr';
import path from 'path';

const PORT = process.env.PORT || 3001;

const app = express();

// ── CORS for Blink clients ────────────────────────────────────────────────────
// Solana Actions require specific CORS headers
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  }),
);

// Required headers for Solana Actions
app.use((_req, res, next) => {
  res.setHeader('X-Action-Version', '2.0');
  res.setHeader('X-Blockchain-Ids', 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
  next();
});

app.use(express.json());

// ── Static files (actions.json) ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Actions Routes ────────────────────────────────────────────────────────────
app.get('/api/actions/stake-skr', stakeSkrAction.get);
app.post('/api/actions/stake-skr', stakeSkrAction.post);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ecoquest-actions', timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌿 EcoQuest Actions Server running on http://localhost:${PORT}`);
  console.log(`   Blink URL: http://localhost:${PORT}/api/actions/stake-skr`);
  console.log(`   Actions.json: http://localhost:${PORT}/actions.json\n`);
});
