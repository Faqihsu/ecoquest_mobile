// ─────────────────────────────────────────────────────────────────────────────
// Anchor IDL — EcoQuest Mobile Program
//
// Auto-generated from target/idl/ecoquest_mobile.json
// Discriminators computed via: sha256("global:<instruction_name>")[0:8]
// Verified from: node -e "require('./ecoquest_mobile.json').instructions.forEach(ix => ...)"
// ─────────────────────────────────────────────────────────────────────────────

import idlJson from './ecoquest_mobile.json';

export const ECOQUEST_IDL = idlJson as any;
export const PROGRAM_ADDRESS = idlJson.address;

/**
 * ALL instruction discriminators extracted from compiled IDL.
 * These are the first 8 bytes of sha256("global:<instruction_name>").
 */
export const DISCRIMINATORS = {
  // ── Quest ──────────────────────────────────────────────────────────────────
  initializeQuestProgram: Buffer.from([186, 162, 224, 81, 175, 41, 75, 0]),
  mintNftProof:           Buffer.from([41, 154, 99, 134, 96, 38, 70, 209]),

  // ── Staking ────────────────────────────────────────────────────────────────
  initializeStakePool:    Buffer.from([48, 189, 243, 73, 19, 67, 36, 83]),
  initializeStaker:       Buffer.from([131, 155, 29, 159, 5, 65, 156, 247]),
  stakeSkr:               Buffer.from([1, 218, 232, 36, 151, 113, 160, 26]),
  unstakeSkr:             Buffer.from([110, 198, 72, 203, 175, 191, 224, 43]),
  claimStakingRewards:    Buffer.from([229, 141, 170, 69, 111, 94, 6, 72]),
  closeStaker:            Buffer.from([143, 15, 126, 133, 130, 1, 42, 62]),
  delegateToGuardian:     Buffer.from([71, 0, 103, 16, 187, 186, 26, 133]),
  undelegateFromGuardian: Buffer.from([241, 41, 22, 249, 193, 14, 107, 227]),

  // ── PvP Arena ──────────────────────────────────────────────────────────────
  initializeArena:        Buffer.from([11, 37, 221, 1, 205, 120, 25, 230]),
  createDuel:             Buffer.from([49, 28, 93, 11, 75, 242, 69, 165]),
  acceptDuel:             Buffer.from([80, 52, 90, 135, 172, 221, 175, 102]),
  settleDuel:             Buffer.from([148, 90, 251, 130, 217, 144, 190, 239]),

  // ── Governance ─────────────────────────────────────────────────────────────
  initializeGovernance:   Buffer.from([171, 87, 101, 237, 27, 107, 201, 57]),
  createProposal:         Buffer.from([132, 116, 68, 174, 216, 160, 198, 22]),
  voteOnProposal:         Buffer.from([188, 239, 13, 88, 119, 199, 251, 119]),
  executeProposal:        Buffer.from([186, 60, 116, 133, 108, 128, 111, 28]),
} as const;
