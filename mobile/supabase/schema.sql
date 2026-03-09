-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Schema for EcoQuest Hybrid Storage
--
-- Run this in Supabase SQL Editor to set up the cloud database.
-- These tables store synced quest data for:
--   1. Cross-device persistence
--   2. Mainnet token conversion readiness
--   3. Leaderboard / analytics
-- ─────────────────────────────────────────────────────────────────────────────

-- ── eco_quests: Individual completed quests ──────────────────────────────────

CREATE TABLE IF NOT EXISTS eco_quests (
  id              TEXT PRIMARY KEY,         -- e.g. "uq-1709901234567"
  wallet_address  TEXT NOT NULL,            -- Solana wallet pubkey (base58)
  title           TEXT NOT NULL,
  category        TEXT NOT NULL,            -- Pantai, Hutan, Sungai, Kota, Lainnya
  eco_reward      INTEGER NOT NULL DEFAULT 0,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  completed_at    BIGINT NOT NULL,          -- unix timestamp (ms)
  synced_at       BIGINT NOT NULL,          -- unix timestamp (ms)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_eco_quests_wallet
  ON eco_quests (wallet_address);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_eco_quests_reward
  ON eco_quests (eco_reward DESC);

-- ── eco_points_summary: Aggregated points per wallet ────────────────────────

CREATE TABLE IF NOT EXISTS eco_points_summary (
  wallet_address  TEXT PRIMARY KEY,         -- Solana wallet pubkey (base58)
  total_points    INTEGER NOT NULL DEFAULT 0,
  quest_count     INTEGER NOT NULL DEFAULT 0,
  last_sync       BIGINT NOT NULL,          -- unix timestamp (ms)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON eco_points_summary
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at();

-- ── Row Level Security (RLS) ────────────────────────────────────────────────
-- Enable RLS but allow anon key to read/write (for mobile app)
-- In production, use JWT-based auth for stricter security.

ALTER TABLE eco_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE eco_points_summary ENABLE ROW LEVEL SECURITY;

-- Allow insert/update via anon key (mobile app)
CREATE POLICY "Allow anon insert quests"
  ON eco_quests FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update quests"
  ON eco_quests FOR UPDATE
  TO anon USING (true);

CREATE POLICY "Allow anon select quests"
  ON eco_quests FOR SELECT
  TO anon USING (true);

CREATE POLICY "Allow anon insert points"
  ON eco_points_summary FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update points"
  ON eco_points_summary FOR UPDATE
  TO anon USING (true);

CREATE POLICY "Allow anon select points"
  ON eco_points_summary FOR SELECT
  TO anon USING (true);

-- ── Useful views ─────────────────────────────────────────────────────────────

-- Leaderboard: Top ECO earners
CREATE OR REPLACE VIEW eco_leaderboard AS
SELECT
  wallet_address,
  total_points,
  quest_count,
  last_sync,
  RANK() OVER (ORDER BY total_points DESC) AS rank
FROM eco_points_summary
ORDER BY total_points DESC;
