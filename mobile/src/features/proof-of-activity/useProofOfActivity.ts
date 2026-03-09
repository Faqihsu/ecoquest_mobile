// ─────────────────────────────────────────────────────────────────────────────
// useProofOfActivity — React Hook
//
// State machine:
//   idle → gps_check → camera → uploading → submitting → done | error
//
// On-chain submission now delegates to useQuestActions.claimNftProof(),
// which uses useSolanaTransaction for proper retry/toast/Zustand lifecycle.
//
// Usage:
//   const { state, startProof, error, result } = useProofOfActivity(questId, publicKey, mwaSign);
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import {
  executeProofOfActivity,
  AntiCheatError,
  UploadError,
  ProgressStep,
} from './proofOfActivityService';
import { CameraRef } from './cameraCapture';
import { ActivityProof, ProofState } from './types';
import { useQuestActions } from '../../hooks/useQuestActions';
import type { MwaSignFn } from '../../hooks/useSolanaTransaction';

// ── Hook Return Type ──────────────────────────────────────────────────────────

export interface UseProofOfActivityReturn {
  /** Current state machine state */
  state: ProofState;
  /** Human-readable status message for UI display */
  statusMessage: string;
  /** Start the full proof pipeline — call after camera is mounted */
  startProof: () => Promise<void>;
  /** Ref to pass to <CameraView> */
  cameraRef: React.RefObject<CameraRef>;
  /** Error message if state === 'error' */
  error: string | null;
  /** Error type for differentiated UI handling */
  errorType: 'anti_cheat' | 'upload' | 'solana' | 'unknown' | null;
  /** Result if state === 'done' */
  result: (ActivityProof & { signature: string }) | null;
  /** Solana transaction signature if done */
  signature: string | null;
  /** Reset to idle state */
  reset: () => void;
}

// ── Status Messages ───────────────────────────────────────────────────────────

const STATUS_MESSAGES: Record<ProofState, string> = {
  idle: 'Ready to capture proof',
  gps_check: '🛰️ Validating GPS location...',
  camera: '📷 Take a photo of your activity',
  uploading: '☁️ Uploading to decentralized storage...',
  submitting: '⛓️ Submitting proof to Solana...',
  done: '✅ Proof submitted successfully!',
  error: '❌ Proof failed',
};

const PROGRESS_TO_STATE: Record<ProgressStep, ProofState> = {
  gps_validating: 'gps_check',
  gps_passed: 'camera',
  photo_captured: 'uploading',
  uploading: 'uploading',
  upload_done: 'submitting',
  submitting: 'submitting',
  done: 'done',
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProofOfActivity(
  questId: string,
  userPublicKey: PublicKey | null,
  signTransaction: MwaSignFn | null
): UseProofOfActivityReturn {
  const [state, setState] = useState<ProofState>('idle');
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES.idle);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<UseProofOfActivityReturn['errorType']>(null);
  const [result, setResult] = useState<(ActivityProof & { signature: string }) | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const cameraRef = useRef<CameraRef>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Best-pattern on-chain submission via useQuestActions ──────────────────
  const { claimNftProof } = useQuestActions();

  const transition = useCallback((nextState: ProofState, detail?: string) => {
    setState(nextState);
    setStatusMessage(detail ?? STATUS_MESSAGES[nextState]);
  }, []);

  const startProof = useCallback(async () => {
    if (!userPublicKey || !signTransaction) {
      setError('Wallet not connected. Please connect your wallet first.');
      setErrorType('unknown');
      setState('error');
      return;
    }

    // Abort any in-flight proof before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setErrorType(null);
    setResult(null);
    setSignature(null);
    transition('gps_check');

    try {
      // ── Steps 1-3: GPS + Photo + Upload (via service) ─────────────────────
      const proof = await executeProofOfActivity(
        questId,
        cameraRef,
        (step, detail) => {
          transition(PROGRESS_TO_STATE[step], detail);
        },
        controller.signal,
        userPublicKey?.toBase58(),
      );

      // ── Step 4: On-chain submission via useQuestActions ───────────────────
      // claimNftProof uses useSolanaTransaction: retry + toast + Zustand store
      if (controller.signal.aborted) return;
      transition('submitting');
      const sig = await claimNftProof(userPublicKey, proof, signTransaction);

      const fullResult = { ...proof, signature: sig };
      setResult(fullResult);
      setSignature(sig);
      transition('done', `✅ Proof on-chain! TX: ${sig.slice(0, 8)}...`);

    } catch (err) {
      // Silently ignore if we were aborted
      if (controller.signal.aborted) return;

      let message = 'An unexpected error occurred.';
      let type: UseProofOfActivityReturn['errorType'] = 'unknown';

      if (err instanceof AntiCheatError) {
        message = err.message;
        type = 'anti_cheat';
      } else if (err instanceof UploadError) {
        message = err.message;
        type = 'upload';
      } else if (err instanceof Error) {
        // SolanaTransactionError from useSolanaTransaction — already has friendly message
        message = err.message;
        type = 'solana';
      }

      setError(message);
      setErrorType(type);
      transition('error', message);
    }
  }, [questId, userPublicKey, signTransaction, transition, claimNftProof]);

  const reset = useCallback(() => {
    // Abort any in-flight operations cleanly
    abortRef.current?.abort();
    abortRef.current = null;
    setState('idle');
    setStatusMessage(STATUS_MESSAGES.idle);
    setError(null);
    setErrorType(null);
    setResult(null);
    setSignature(null);
  }, []);

  return {
    state,
    statusMessage,
    startProof,
    cameraRef,
    error,
    errorType,
    result,
    signature,
    reset,
  };
}
