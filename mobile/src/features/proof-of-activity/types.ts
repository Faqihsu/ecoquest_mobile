// ─────────────────────────────────────────────────────────────────────────────
// ProofOfActivity — Shared Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw GPS reading from expo-location */
export interface GpsReading {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  /** expo-location sets this to true when mock/fake GPS is active */
  mocked: boolean;
  timestamp: number;
}

/** Result of the anti-cheat GPS validation pipeline */
export interface AntiCheatResult {
  passed: boolean;
  /** Human-readable reason if failed */
  reason?: string;
  /** The validated reading to use downstream */
  reading?: GpsReading;
}

/** Photo captured directly from camera (never from gallery) */
export interface CaptureResult {
  /** Local file URI on device */
  uri: string;
  width: number;
  height: number;
  /** ISO timestamp locked at shutter press — cannot be altered by user */
  capturedAt: string;
  /** SHA-256 hash of raw pixel data for tamper detection */
  integrityHash: string;
}

/** Result after uploading to decentralized storage */
export interface UploadResult {
  /** ipfs://CID or ar://txId for the photo */
  photoUri: string;
  /** ipfs://CID or ar://txId for the JSON metadata */
  metadataUri: string;
  /** Which provider was used */
  provider: 'pinata' | 'irys';
  /** HTTP gateway URL for preview */
  gatewayUrl: string;
}

/** Full proof bundle ready to submit to Solana */
export interface ActivityProof {
  questId: string;
  gps: GpsReading;
  capture: CaptureResult;
  upload: UploadResult;
  /** 32-byte GPS hash (sha256 of lat+lon+timestamp+wallet+quest) as number[] for Anchor */
  gpsHashBytes: number[];
  /** Metadata URI as number[] padded to 200 bytes for Anchor fixed-size field */
  metadataUriBytes: number[];
  metadataUriLen: number;
  /** SHA-256 replay-guard: UserID|GPS|Photo|Timestamp|QuestID — prevents replay attacks */
  replayGuardHash: string;
}

/** State machine states for useProofOfActivity hook */
export type ProofState =
  | 'idle'
  | 'gps_check'
  | 'camera'
  | 'uploading'
  | 'submitting'
  | 'done'
  | 'error';
