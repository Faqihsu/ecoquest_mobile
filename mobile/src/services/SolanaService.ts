import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
const PROGRAM_ID = new PublicKey("4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5");
const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "https://api.devnet.solana.com";

export class SolanaService {
  private connection: Connection;
  private programId: PublicKey;

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, "confirmed");
    this.programId = PROGRAM_ID;
  }

  // ===================== STAKING FUNCTIONS =====================

  async initializeStaking(
    userPublicKey: PublicKey,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = userPublicKey;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to initialize staking:", error);
      throw error;
    }
  }

  async stakeSKR(
    userPublicKey: PublicKey,
    amount: number,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = userPublicKey;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to stake SKR:", error);
      throw error;
    }
  }

  async unstakeSKR(
    userPublicKey: PublicKey,
    amount: number,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = userPublicKey;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to unstake SKR:", error);
      throw error;
    }
  }

  async claimRewards(
    userPublicKey: PublicKey,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = userPublicKey;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to claim rewards:", error);
      throw error;
    }
  }

  // ===================== NFT QUEST FUNCTIONS =====================

  async mintQuestNFT(
    userPublicKey: PublicKey,
    questId: string,
    metadata: any,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = userPublicKey;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to mint quest NFT:", error);
      throw error;
    }
  }

  async verifyQuestCompletion(
    userPublicKey: PublicKey,
    questId: string,
    gpsHash: string,
    photoProofUri: string
  ): Promise<boolean> {
    try {
      // Verify GPS hash format
      if (!gpsHash || gpsHash.length < 5) {
        throw new Error("Invalid GPS hash");
      }

      // Verify photo URI exists
      if (!photoProofUri) {
        throw new Error("Photo proof required");
      }

      return true;
    } catch (error) {
      console.error("Failed to verify quest completion:", error);
      return false;
    }
  }

  // ===================== PVP DUEL FUNCTIONS =====================

  async initializeArena(
    authority: PublicKey,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = authority;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to initialize arena:", error);
      throw error;
    }
  }

  async createDuel(
    challenger: PublicKey,
    nftId: number,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = challenger;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to create duel:", error);
      throw error;
    }
  }

  async acceptDuel(
    defender: PublicKey,
    nftId: number,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = defender;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to accept duel:", error);
      throw error;
    }
  }

  // ===================== GOVERNANCE FUNCTIONS =====================

  async createProposal(
    creator: PublicKey,
    title: string,
    description: string,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = creator;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to create proposal:", error);
      throw error;
    }
  }

  async vote(
    voter: PublicKey,
    proposalId: string,
    direction: "yes" | "no",
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<string> {
    try {
      const transaction = new Transaction();
      transaction.feePayer = voter;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Failed to vote on proposal:", error);
      throw error;
    }
  }

  // ===================== UTILITY FUNCTIONS =====================

  async getBalance(publicKey: PublicKey): Promise<number> {
    try {
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error("Failed to get balance:", error);
      return 0;
    }
  }

  async getConnection(): Promise<Connection> {
    return this.connection;
  }

  async checkIfAccountExists(publicKey: PublicKey): Promise<boolean> {
    try {
      const account = await this.connection.getAccountInfo(publicKey);
      return account !== null;
    } catch (error) {
      console.error("Failed to check account:", error);
      return false;
    }
  }

  // ===================== TRANSACTION UTILITIES =====================

  async getLatestBlockhash(): Promise<string> {
    const { blockhash } = await this.connection.getLatestBlockhash();
    return blockhash;
  }

  async confirmTransaction(signature: string): Promise<boolean> {
    try {
      const confirmed = await this.connection.confirmTransaction(
        signature,
        "confirmed"
      );
      return !confirmed.value.err;
    } catch (error) {
      console.error("Failed to confirm transaction:", error);
      return false;
    }
  }
}

// Export singleton instance
export const solanaService = new SolanaService();
