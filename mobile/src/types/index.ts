// Solana & Wallet Types
import { Connection, Transaction } from "@solana/web3.js";

export interface WalletContextState {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  wallet: any | null;
  connection: Connection;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage: (message: Uint8Array | string) => Promise<Uint8Array>;
  connectWallet: () => Promise<string>;
  disconnectWallet: () => Promise<void>;
}

// Quest Types
export interface Quest {
  id: string;
  title: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    radius: number; // meters
  };
  type: "cleanup" | "plant" | "photo" | "report";
  reward: number; // in points
  difficulty: "easy" | "medium" | "hard";
  imageUrl?: string;
  completedBy?: string[];
}

export interface QuestCompletion {
  questId: string;
  userId: string;
  photoUrl: string;
  gpsHash: string;
  nftMint?: string;
  timestamp: number;
  verified: boolean;
}

// NFT Types
export interface NFTProof {
  mint: string;
  owner: string;
  questId: string;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
  timestamp: number;
  verified: boolean;
}

// Staking Types
export interface StakingPool {
  id: string;
  tokenMint: string;
  rewardMint: string;
  totalStaked: number;
  apy: number; // Annual Percentage Yield
}

export interface StakerInfo {
  user: string;
  stakedAmount: number;
  rewardsEarned: number;
  lastClaimTimestamp: number;
  delegatedTo?: string;
  startTimestamp: number;
}

export interface GuardianPool {
  guardian: string;
  totalDelegated: number;
  governancePower: number;
}

// Combo Types (BONK + SKR)
export interface BonkSKRCombo {
  user: string;
  skrStaked: number;
  bonkStaked: number;
  airdropPoints: number;
  active: boolean;
}

// PvP Types
export interface Duel {
  id: string;
  challenger: string;
  challengerNft: string;
  acceptor?: string;
  acceptorNft?: string;
  stakeAmount: number;
  status: "open" | "accepted" | "settled" | "cancelled";
  winner?: string;
  createdAt: number;
  settledAt?: number;
}

export interface NFTStats {
  nftMint: string;
  owner: string;
  wins: number;
  losses: number;
  totalEarnings: number;
  powerLevel: number;
}

// Governance Types
export interface Proposal {
  id: string;
  creator: string;
  title: string;
  description: string;
  questReward: number;
  yesVotes: number;
  noVotes: number;
  status: "active" | "passed" | "rejected" | "executed";
  createdAt: number;
  votingEndTime: number;
}

export interface Vote {
  proposalId: string;
  voter: string;
  direction: boolean; // true = yes, false = no
  votingPower: number;
  votedAt: number;
}

// User Profile Types
export interface UserProfile {
  userId: string;
  username: string;
  avatar?: string;
  wallet: string;
  totalPoints: number;
  totalQuests: number;
  nftBalance: number;
  stakedAmount: number;
  rewards: number;
  level: number;
  badges: string[];
}

// Leaderboard Types
export interface LeaderboardEntry {
  rank: number;
  username: string;
  points: number;
  questsCompleted: number;
  nftsOwned: number;
  winRate?: number;
}
