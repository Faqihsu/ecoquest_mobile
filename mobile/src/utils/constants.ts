// Constants for EcoQuest Mobile

export const PROGRAM_ID = "4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5";

export const RPC_ENDPOINT =
  process.env.SOLANA_RPC_ENDPOINT || "https://api.devnet.solana.com";

export const HELIUS_RPC = "https://devnet.helius-rpc.com/";

// Quest Locations (Yogyakarta/Wonogiri Region)
export const QUEST_LOCATIONS = {
  progo_river: {
    latitude: -7.7956,
    longitude: 110.3695,
    radius: 500,
    name: "Progo River",
  },
  wonogiri_forest: {
    latitude: -8.2065,
    longitude: 111.0378,
    radius: 1000,
    name: "Wonogiri Forest",
  },
  nature_reserve: {
    latitude: -7.5596,
    longitude: 110.8246,
    radius: 750,
    name: "Nature Reserve",
  },
  dumping_site: {
    latitude: -7.8,
    longitude: 110.45,
    radius: 800,
    name: "Dumping Site",
  },
};

// Token Mints (Devnet)
export const TOKEN_MINTS = {
  SKR: "SKRm6zv8SnV33ygwSXwq31GtvkwsqvB7xNXfact3b1P",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixVrt5zelcHAqCPP312m",
};

// Staking Configuration
export const STAKING_CONFIG = {
  baseAPY: 20,
  maxMultiplier: 2,
  minStakeAmount: 100,
  lockupPeriod: 0, // Flexible staking
  rewardsDuration: 86400, // 1 day
};

// PvP Arena Configuration
export const PVP_CONFIG = {
  minStake: 100,
  maxStake: 10000,
  platformFee: 0.01, // 1%
  matchmakingTimeout: 300, // 5 minutes
};

// Governance Configuration
export const GOVERNANCE_CONFIG = {
  votingPeriod: 604800, // 7 days
  minProposalStake: 1000,
  proposalCost: 100,
  executionDelay: 0,
};

// Combo Rewards (BONK + SKR)
export const COMBO_REWARDS = {
  minSKRStake: 1000,
  minBONKStake: 500,
  multiplier: 2,
  airdropFrequency: 2592000, // 30 days
};

// Display Configuration
export const DISPLAY_CONFIG = {
  theme: "dark",
  primaryColor: "#00ff00",
  accentColor: "#ffaa00",
  successColor: "#00ff00",
  errorColor: "#ff4444",
  warningColor: "#ffaa00",
};

// Network Configuration
export const NETWORK_CONFIG = {
  name: "devnet",
  chainId: 103,
  cluster: "devnet",
};

// Feature Flags
export const FEATURE_FLAGS = {
  enableStaking: true,
  enablePvP: true,
  enableGovernance: true,
  enableCombo: true,
  enableARCamera: true, // Feature 3 implemented ✅
  enableLeaderboard: true,
  enableOfflineMode: true,
};

// Admin wallet address — only this wallet can access Admin Dashboard
// Replace with your actual admin wallet address
export const ADMIN_WALLET = process.env.EXPO_PUBLIC_ADMIN_WALLET ?? '4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5';

