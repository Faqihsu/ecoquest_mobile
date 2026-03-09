// ─────────────────────────────────────────────────────────────────────────────
// useQuestSubmission.ts
// EcoQuest Mobile — Quest Submission React Hook
//
// Full quest submission flow:
//   1. Run AntiCheatService full validation (GPS spoof + geofence + velocity)
//   2. Execute ProofOfActivity pipeline (photo capture → IPFS upload → Solana TX)
//   3. Expose typed state machine to the UI layer
//
// State machine:
//   idle → validating_location → capturing_proof → submitting_chain → done | error
//
// Usage:
//   const { state, submit, error, txSignature } = useQuestSubmission(quest);
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { antiCheatService, type FullAntiCheatReport, type QuestSiteCoordinates } from '@services/AntiCheatService';
import {
  executeProofOfActivity,
  AntiCheatError,
  UploadError,
  SolanaSubmitError,
  type ProgressStep,
} from '@features/proof-of-activity/proofOfActivityService';
import type { CameraRef } from '@features/proof-of-activity/cameraCapture';
import type { ActivityProof } from '@features/proof-of-activity/types';
import { useQuestActions } from '../../../hooks/useQuestActions';
import type { MwaSignFn } from '../../../hooks/useSolanaTransaction';

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestSubmissionState =
  | 'idle'
  | 'validating_location'   // Step 1: Anti-cheat checks running
  | 'capturing_proof'        // Step 2: Camera + GPS hash being collected
  | 'uploading_proof'        // Step 3: Uploading to IPFS/Arweave
  | 'submitting_chain'       // Step 4: Submitting to Solana smart contract
  | 'done'                   // Success — txSignature available
  | 'error';                 // Failed — errorMessage + errorType available

export type QuestSubmissionErrorType =
  | 'anti_cheat'
  | 'geofence'
  | 'upload'
  | 'solana'
  | 'wallet_not_connected'
  | 'unknown';

export interface QuestSubmissionResult {
  proof: ActivityProof;
  txSignature: string;
  antiCheatReport: FullAntiCheatReport;
}

export interface QuestInfo {
  id: string;
  site: QuestSiteCoordinates;
}

// ── State Messages ────────────────────────────────────────────────────────────

const STATE_MESSAGES: Record<QuestSubmissionState, string> = {
  idle: 'Ready to submit quest proof',
  validating_location: '🛰️ Validating your GPS location...',
  capturing_proof: '📷 Capturing photographic proof...',
  uploading_proof: '☁️ Uploading proof to decentralized storage...',
  submitting_chain: '⛓️ Recording proof on Solana blockchain...',
  done: '✅ Quest completed! Proof recorded on-chain.',
  error: '❌ Quest submission failed',
};

const PROGRESS_TO_STATE: Partial<Record<ProgressStep, QuestSubmissionState>> = {
  gps_validating: 'validating_location',
  gps_passed: 'capturing_proof',
  photo_captured: 'uploading_proof',
  uploading: 'uploading_proof',
  upload_done: 'submitting_chain',
  submitting: 'submitting_chain',
  done: 'done',
};

// ── Hook Return Interface ─────────────────────────────────────────────────────

export interface UseQuestSubmissionReturn {
  /** Current state machine state */
  state: QuestSubmissionState;
  /** Human-readable message for progress UI */
  statusMessage: string;
  /** Ref to pass to <CameraView> — must be mounted before calling submit() */
  cameraRef: React.RefObject<CameraRef>;
  /** Start the full quest submission pipeline */
  submit: () => Promise<void>;
  /** Error message if state === 'error' */
  errorMessage: string | null;
  /** Error category for differentiated UI handling */
  errorType: QuestSubmissionErrorType | null;
  /** Full anti-cheat report (available after validating_location completes) */
  antiCheatReport: FullAntiCheatReport | null;
  /** On-chain transaction signature (available when state === 'done') */
  txSignature: string | null;
  /** Full result (available when state === 'done') */
  result: QuestSubmissionResult | null;
  /** Reset hook to idle — use to allow retry */
  reset: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useQuestSubmission
 *
 * Wires anti-cheat validation + proof-of-activity pipeline into a single
 * declarative React hook. The UI only needs to:
 *   1. Mount a <CameraView ref={cameraRef} />
 *   2. Call submit() on button press
 *   3. React to state changes
 *
 * @param quest       - Quest metadata (id + geographic site)
 * @param walletKey   - Connected wallet public key (null if not connected)
 * @param signTx      - Wallet adapter signTransaction function
 */
export function useQuestSubmission(
  quest: QuestInfo,
  walletKey: PublicKey | null,
  signTx: MwaSignFn | null
): UseQuestSubmissionReturn {

  const [state, setState] = useState<QuestSubmissionState>('idle');
  const [statusMessage, setStatusMessage] = useState(STATE_MESSAGES.idle);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<QuestSubmissionErrorType | null>(null);
  const [antiCheatReport, setAntiCheatReport] = useState<FullAntiCheatReport | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [result, setResult] = useState<QuestSubmissionResult | null>(null);

  const cameraRef = useRef<CameraRef>(null);

  // Best-pattern on-chain submission via useQuestActions (uses useSolanaTransaction lifecycle)
  const { claimNftProof } = useQuestActions();

  // ── Transition helper ─────────────────────────────────────────────────────

  const transition = useCallback(
    (next: QuestSubmissionState, detail?: string) => {
      setState(next);
      setStatusMessage(detail ?? STATE_MESSAGES[next]);
    },
    []
  );

  // ── Submit handler ────────────────────────────────────────────────────────

  const submit = useCallback(async () => {
    // Guard: wallet must be connected
    if (!walletKey || !signTx) {
      setErrorMessage('Wallet not connected. Please connect your Solana wallet to submit quest proof.');
      setErrorType('wallet_not_connected');
      setState('error');
      return;
    }

    // Reset previous run
    setErrorMessage(null);
    setErrorType(null);
    setAntiCheatReport(null);
    setTxSignature(null);
    setResult(null);
    antiCheatService.reset();

    try {
      // ── Phase 1: Anti-Cheat Validation ──────────────────────────────────
      transition('validating_location');

      const report = await antiCheatService.runFullValidation(quest.site);
      setAntiCheatReport(report);

      if (!report.passed) {
        const reason = report.firstFailureReason ?? 'Location validation failed.';
        const isGeofence = report.checks.geofence && !report.checks.geofence.passed;

        setErrorMessage(reason);
        setErrorType(isGeofence ? 'geofence' : 'anti_cheat');
        setState('error');
        setStatusMessage(reason);
        return;
      }

      // ── Phase 2-3: GPS + Photo + Upload (service, no wallet) ────────────
      transition('capturing_proof');

      const proof = await executeProofOfActivity(
        quest.id,
        cameraRef,
        (step, detail) => {
          const next = PROGRESS_TO_STATE[step];
          if (next) transition(next, detail);
        }
      );

      // ── Phase 4: On-chain submission via useQuestActions ─────────────────
      // claimNftProof uses useSolanaTransaction: retry + toast + Zustand store
      transition('submitting_chain');
      const sig = await claimNftProof(walletKey, proof, signTx);

      // ── Done ─────────────────────────────────────────────────────────────
      const submissionResult: QuestSubmissionResult = {
        proof,
        txSignature: sig,
        antiCheatReport: report,
      };

      setResult(submissionResult);
      setTxSignature(sig);
      transition('done', `✅ Quest ${quest.id} completed! TX: ${sig.slice(0, 8)}...`);

    } catch (err) {
      let message = 'An unexpected error occurred. Please try again.';
      let type: QuestSubmissionErrorType = 'unknown';

      if (err instanceof AntiCheatError) {
        message = err.message;
        type = 'anti_cheat';
      } else if (err instanceof UploadError) {
        message = err.message;
        type = 'upload';
      } else if (err instanceof SolanaSubmitError) {
        message = err.message;
        type = 'solana';
      } else if (err instanceof Error) {
        message = err.message;
      }

      setErrorMessage(message);
      setErrorType(type);
      transition('error', message);
    }
  }, [quest, walletKey, signTx, transition, claimNftProof]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setState('idle');
    setStatusMessage(STATE_MESSAGES.idle);
    setErrorMessage(null);
    setErrorType(null);
    setAntiCheatReport(null);
    setTxSignature(null);
    setResult(null);
    antiCheatService.reset();
  }, []);

  return {
    state,
    statusMessage,
    cameraRef,
    submit,
    errorMessage,
    errorType,
    antiCheatReport,
    txSignature,
    result,
    reset,
  };
}
