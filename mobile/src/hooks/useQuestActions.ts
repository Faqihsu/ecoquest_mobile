// ─────────────────────────────────────────────────────────────────────────────
// useQuestActions — Quest Domain Hook
//
// Wraps useSolanaTransaction for quest-specific operations:
//   - claimNftProof: submit mintNftProof instruction to Anchor program
//   - useQuestEvents: subscribe to QuestCompletedEvent via WebSocket
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { useSolanaTransaction, MwaSignFn } from './useSolanaTransaction';
import { useHeliusWebSocket, QuestCompletedEvent } from './useHeliusWebSocket';
import { ECOQUEST_PROGRAM_ID } from '../shared/config/constants';
import { ActivityProof } from '../features/proof-of-activity/types';

// ── Instruction Builders ──────────────────────────────────────────────────────

/**
 * Build the `mintNftProof` Anchor instruction.
 * Discriminator: sha256("global:mint_nft_proof")[0..8]
 */
function buildMintNftProofIx(
  userPublicKey: PublicKey,
  proof: ActivityProof
): TransactionInstruction {
  const discriminator = Buffer.from([41, 154, 99, 134, 96, 38, 70, 209]);
  const questIdBn = new anchor.BN(proof.questId);

  const [questProgramPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('quest_program')],
    ECOQUEST_PROGRAM_ID
  );
  const [proofPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('quest_proof'),
      questIdBn.toArrayLike(Buffer, 'le', 8),
      userPublicKey.toBuffer(),
    ],
    ECOQUEST_PROGRAM_ID
  );

  // Layout: discriminator(8) + quest_id(8) + gps_hash(32) + metadata_uri(200) + metadata_uri_len(1)
  const data = Buffer.alloc(8 + 8 + 32 + 200 + 1);
  let offset = 0;
  discriminator.copy(data, offset); offset += 8;
  questIdBn.toArrayLike(Buffer, 'le', 8).copy(data, offset); offset += 8;
  Buffer.from(proof.gpsHashBytes).copy(data, offset); offset += 32;
  Buffer.from(proof.metadataUriBytes).copy(data, offset); offset += 200;
  data.writeUInt8(proof.metadataUriLen, offset);

  return new TransactionInstruction({
    programId: ECOQUEST_PROGRAM_ID,
    keys: [
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: questProgramPda, isSigner: false, isWritable: true },
      { pubkey: proofPda, isSigner: false, isWritable: true },
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseQuestActionsReturn {
  /**
   * Submit a completed quest proof to the Anchor program.
   * Handles full tx lifecycle: sign → send → confirm → finalize.
   */
  claimNftProof: (
    userPublicKey: PublicKey,
    proof: ActivityProof,
    mwaSign: MwaSignFn
  ) => Promise<string>;

  /** Whether any quest tx is currently in-flight */
  isPending: boolean;
}

export function useQuestActions(): UseQuestActionsReturn {
  const { sendTransaction, pendingCount } = useSolanaTransaction();

  const claimNftProof = useCallback(
    async (
      userPublicKey: PublicKey,
      proof: ActivityProof,
      mwaSign: MwaSignFn
    ): Promise<string> => {
      const ix = buildMintNftProofIx(userPublicKey, proof);
      const tx = new Transaction().add(ix);
      tx.feePayer = userPublicKey;

      const result = await sendTransaction(tx, mwaSign, {
        label: `Klaim NFT Quest #${proof.questId}`,
        commitment: 'confirmed',
      });

      return result.signature;
    },
    [sendTransaction]
  );

  return {
    claimNftProof,
    isPending: pendingCount > 0,
  };
}

// ── Quest Event Subscription ──────────────────────────────────────────────────

/**
 * Subscribe to real-time QuestCompletedEvent from the program.
 *
 * @example
 * useQuestEvents((event) => {
 *   if (event.user === myPublicKey) showSuccessToast(event.questId);
 * });
 */
export function useQuestEvents(
  onQuestCompleted?: (event: QuestCompletedEvent) => void
) {
  return useHeliusWebSocket((event) => {
    if (event.type === 'QuestCompletedEvent') {
      onQuestCompleted?.(event);
    }
  });
}
