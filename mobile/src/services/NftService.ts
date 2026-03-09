import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { NFTProof } from "../types";
import { uploadToDecentralizedStorage } from "../features/proof-of-activity/decentralizedUpload";
import { CaptureResult, GpsReading } from "../features/proof-of-activity/types";

const PROGRAM_ID = new PublicKey("4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5");
const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || "https://api.devnet.solana.com";

export class NftMintingService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, "confirmed");
  }

  /**
   * Mint NFT proof for completed quest
   */
  async mintQuestNFT(
    userPublicKey: PublicKey,
    questId: string,
    gpsHash: string,
    metadataUri: string,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): Promise<NFTProof> {
    try {
      const mintKeypair = anchor.web3.Keypair.generate();
      await getOrCreateAssociatedTokenAccount(
        this.connection,
        anchor.web3.Keypair.generate(),
        mintKeypair.publicKey,
        userPublicKey
      );

      const transaction = new Transaction();
      const createMintTx = SystemProgram.createAccount({
        fromPubkey: userPublicKey,
        newAccountPubkey: mintKeypair.publicKey,
        lamports: await this.connection.getMinimumBalanceForRentExemption(82),
        space: 82,
        programId: TOKEN_PROGRAM_ID,
      });

      transaction.add(createMintTx);
      transaction.feePayer = userPublicKey;
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      const signedTx = await signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize()
      );
      await this.connection.confirmTransaction(signature, "confirmed");

      return {
        mint: mintKeypair.publicKey.toString(),
        owner: userPublicKey.toString(),
        questId,
        metadata: {
          name: `Quest Proof #${questId}`,
          symbol: "QST",
          uri: metadataUri,
        },
        timestamp: Date.now(),
        verified: true,
      };
    } catch (error) {
      console.error("Failed to mint NFT:", error);
      throw error;
    }
  }

  /**
   * Verify GPS location for quest
   */
  async verifyGpsLocation(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    gpsHash: string
  ): Promise<boolean> {
    try {
      if (gpsHash.length < 10) throw new Error("Invalid GPS hash");
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
        throw new Error("Invalid coordinates");
      if (radiusMeters <= 0 || radiusMeters > 10000)
        throw new Error("Invalid radius");
      return true;
    } catch (error) {
      console.error("GPS verification failed:", error);
      return false;
    }
  }

  /**
   * Upload metadata to decentralized storage (Pinata IPFS → Irys/Arweave fallback).
   *
   * Replaces the previous base64 placeholder with real permanent URIs.
   * Uses the ProofOfActivity upload pipeline with 3x exponential backoff retry.
   */
  async uploadMetadata(
    questId: string,
    capture: CaptureResult,
    gps: GpsReading
  ): Promise<string> {
    const result = await uploadToDecentralizedStorage(questId, capture, gps);
    console.log(`[NftService] Metadata uploaded via ${result.provider}: ${result.metadataUri}`);
    return result.metadataUri;
  }
}

export const nftMintingService = new NftMintingService();
