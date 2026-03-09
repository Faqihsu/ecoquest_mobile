// ─────────────────────────────────────────────────────────────────────────────
// ProofOfActivity Orchestrator Service
//
// Coordinates steps 1-3 of the proof pipeline:
//   GPS Anti-Spoof → Camera Capture → Compress & Upload
//
// DESIGN: This service NO LONGER handles Solana submission.
// On-chain submission is delegated to useQuestActions.claimNftProof(),
// which uses the full useSolanaTransaction lifecycle (retry, toast, Zustand).
//
// Callers get back an ActivityProof ready to pass to useQuestActions.
// ─────────────────────────────────────────────────────────────────────────────

import { validateGpsAntiSpoof } from './gpsAntiSpoof';
import { captureRealTimePhoto, CameraRef } from './cameraCapture';
import { uploadToDecentralizedStorage } from './decentralizedUpload';
import { ActivityProof, CaptureResult, GpsReading, UploadResult } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute a 32-byte GPS hash from lat/lon/timestamp + user identity.
 * Stored on-chain as tamper-evident location proof.
 *
 * Includes walletAddress + questId to prevent replay attacks:
 * - Same GPS data can't be reused by a different wallet
 * - Same GPS data can't be reused for a different quest
 */
async function computeGpsHash(
  gps: GpsReading,
  walletAddress: string,
  questId: string,
): Promise<number[]> {
  const input = [
    gps.latitude.toFixed(8),
    gps.longitude.toFixed(8),
    String(gps.timestamp),
    walletAddress,
    questId,
  ].join(':');
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer));
}

/**
 * Compute a replay-guard hash: UserID + Timestamp + Location + PhotoHash.
 *
 * This nonce-like hash ensures that:
 * - Each proof submission is unique (tied to specific photo capture)
 * - Cannot be replayed even if the attacker intercepts the proof bundle
 * - Binds the photo integrity to the location claim
 *
 * This hash should be included in the on-chain transaction data.
 */
async function computeReplayGuardHash(
  walletAddress: string,
  gps: GpsReading,
  capturedAt: string,
  photoIntegrityHash: string,
  questId: string,
): Promise<string> {
  const input = [
    walletAddress,
    String(gps.timestamp),
    gps.latitude.toFixed(8),
    gps.longitude.toFixed(8),
    capturedAt,
    photoIntegrityHash,
    questId,
    String(Date.now()), // Submission-time nonce
  ].join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encode a URI string into a fixed-size 200-byte number[] for the Anchor
 * `metadata_uri: [u8; 200]` field. Pads with zeros.
 */
function encodeUriToBytes(uri: string): { bytes: number[]; len: number } {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(uri);
  const bytes = new Uint8Array(200);
  const len = Math.min(encoded.length, 200);
  bytes.set(encoded.slice(0, len));
  return { bytes: Array.from(bytes), len };
}

// ── Error Types ───────────────────────────────────────────────────────────────

export class AntiCheatError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AntiCheatError';
  }
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

// SolanaSubmitError is no longer thrown here — submission is in useQuestActions.
// Keep the export for any existing imports that reference it.
export class SolanaSubmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolanaSubmitError';
  }
}

// ── Progress Callback ─────────────────────────────────────────────────────────

export type ProgressStep =
  | 'gps_validating'
  | 'gps_passed'
  | 'photo_captured'
  | 'uploading'
  | 'upload_done'
  | 'submitting'   // emitted by caller (useProofOfActivity) after claimNftProof
  | 'done';

export type ProgressCallback = (step: ProgressStep, detail?: string) => void;

// ── Main Orchestrator ─────────────────────────────────────────────────────────

/**
 * Execute steps 1–3 of the ProofOfActivity pipeline:
 *   1. GPS Anti-Spoof Validation (7-layer)
 *   2. Real-time Camera Capture (SHA-256 integrity hash)
 *   3. Compress + Upload to Pinata IPFS / Irys (fallback)
 *
 * Returns an ActivityProof bundle ready to pass to
 * `useQuestActions.claimNftProof()` for on-chain submission.
 *
 * @throws AntiCheatError  — if GPS validation fails
 * @throws UploadError     — if both Pinata and Irys fail after retries
 */
export async function executeProofOfActivity(
  questId: string,
  cameraRef: React.RefObject<CameraRef>,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  walletAddress?: string,
): Promise<ActivityProof> {

  // ── Step 1: GPS Anti-Spoof Validation ──────────────────────────────────────
  onProgress?.('gps_validating');
  if (signal?.aborted) throw new Error('Proof cancelled by user.');
  const gpsResult = await validateGpsAntiSpoof();

  if (!gpsResult.passed || !gpsResult.reading) {
    throw new AntiCheatError(gpsResult.reason ?? 'GPS validation failed.');
  }

  const gps: GpsReading = gpsResult.reading;
  onProgress?.('gps_passed', `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`);

  // ── Step 2: Real-time Camera Capture ───────────────────────────────────────
  if (signal?.aborted) throw new Error('Proof cancelled by user.');
  const capture: CaptureResult = await captureRealTimePhoto(cameraRef);
  onProgress?.('photo_captured', `Captured at ${capture.capturedAt}`);

  // ── Step 3: Compress & Upload ──────────────────────────────────────────────
  if (signal?.aborted) throw new Error('Proof cancelled by user.');
  onProgress?.('uploading');
  let upload: UploadResult;
  try {
    upload = await uploadToDecentralizedStorage(questId, capture, gps, signal);
  } catch (err) {
    if (signal?.aborted) throw new Error('Upload cancelled by user.');
    throw new UploadError(`Upload failed: ${String(err)}`);
  }
  onProgress?.('upload_done', `${upload.provider}: ${upload.metadataUri}`);

  // ── Build Anchor-compatible data ───────────────────────────────────────────
  if (signal?.aborted) throw new Error('Proof cancelled by user.');

  const wallet = walletAddress ?? 'anonymous';
  const gpsHashBytes = await computeGpsHash(gps, wallet, questId);
  const { bytes: metadataUriBytes, len: metadataUriLen } = encodeUriToBytes(upload.metadataUri);

  // ── Replay Guard Hash ─────────────────────────────────────────────────────
  // Unique hash binding: UserID + GPS + Photo + Timestamp + QuestID
  // This prevents replay attacks even if proof bundle is intercepted.
  const replayGuardHash = await computeReplayGuardHash(
    wallet, gps, capture.capturedAt, capture.integrityHash, questId,
  );

  return {
    questId,
    gps,
    capture,
    upload,
    gpsHashBytes,
    metadataUriBytes,
    metadataUriLen,
    replayGuardHash,
  };
}
