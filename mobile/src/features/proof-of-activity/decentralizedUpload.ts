// ─────────────────────────────────────────────────────────────────────────────
// Decentralized Upload Service
//
// Upload pipeline:
//   1. Compress photo to JPEG @ 70% quality via expo-image-manipulator
//   2. Try Pinata IPFS (primary) — returns ipfs://CID
//   3. On failure, try Irys/Arweave (fallback) — returns ar://txId
//   4. Upload JSON metadata referencing the photo URI
//   5. Return UploadResult with both URIs + HTTP gateway URL
//
// Retry strategy: 3 attempts with exponential backoff (1s → 2s → 4s)
// ─────────────────────────────────────────────────────────────────────────────

import * as ImageManipulator from 'expo-image-manipulator';
import Constants from 'expo-constants';
import { CaptureResult, GpsReading, UploadResult } from './types';

// ── Config ────────────────────────────────────────────────────────────────────

// Read keys from Expo extra config (set in app.json → extra).
// Fallback to process.env for local `expo start` dev server.
const PINATA_API_KEY =
  (Constants.expoConfig?.extra?.PINATA_API_KEY as string) ??
  process.env.PINATA_API_KEY ??
  '';
const PINATA_SECRET_KEY =
  (Constants.expoConfig?.extra?.PINATA_SECRET_KEY as string) ??
  process.env.PINATA_SECRET_KEY ??
  '';
const PINATA_UPLOAD_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

const IRYS_UPLOAD_URL = 'https://node1.irys.xyz/upload';
const ARWEAVE_GATEWAY = 'https://arweave.net';

const COMPRESSION_QUALITY = 0.7;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff.
 * Retries up to MAX_RETRIES times on any thrown error.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[Upload] ${label} attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${delay}ms...`, err);

      if (attempt < MAX_RETRIES) {
        await sleep(delay);
      }
    }
  }

  throw new Error(`[Upload] ${label} failed after ${MAX_RETRIES} attempts: ${String(lastError)}`);
}

// ── Step 1: Compress ──────────────────────────────────────────────────────────

/**
 * Compress a captured photo to JPEG at 70% quality.
 * Reduces file size ~60-70% while maintaining visual quality for NFT metadata.
 *
 * @returns compressed local URI
 */
export async function compressPhoto(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1080 } }], // Max 1080px wide
    {
      compress: COMPRESSION_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}

// ── Step 2a: Upload to Pinata IPFS ────────────────────────────────────────────

async function uploadPhotoToPinata(compressedUri: string): Promise<string> {
  // Build multipart form data
  const formData = new FormData();

  // React Native FormData accepts { uri, name, type } objects
  formData.append('file', {
    uri: compressedUri,
    name: `ecoquest-proof-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as any);

  formData.append(
    'pinataMetadata',
    JSON.stringify({ name: `EcoQuest Photo ${Date.now()}` })
  );

  const response = await fetch(PINATA_UPLOAD_URL, {
    method: 'POST',
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata photo upload failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return `ipfs://${data.IpfsHash}`;
}

async function uploadMetadataToPinata(metadata: object): Promise<string> {
  const response = await fetch(PINATA_JSON_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `EcoQuest Metadata ${Date.now()}` },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata metadata upload failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return `ipfs://${data.IpfsHash}`;
}

// ── Step 2b: Fallback — Upload to Irys (Arweave) ─────────────────────────────

async function uploadPhotoToIrys(compressedUri: string): Promise<string> {
  // Read file as blob
  const response = await fetch(compressedUri);
  const blob = await response.blob();

  const uploadResponse = await fetch(IRYS_UPLOAD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      // Note: In production, Irys requires a funded wallet signature.
      // For devnet/testing, use the free tier (files < 100KB are free).
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Irys upload failed (${uploadResponse.status}): ${text}`);
  }

  const data = await uploadResponse.json();
  return `ar://${data.id}`;
}

async function uploadMetadataToIrys(metadata: object): Promise<string> {
  const uploadResponse = await fetch(IRYS_UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Irys metadata upload failed (${uploadResponse.status}): ${text}`);
  }

  const data = await uploadResponse.json();
  return `ar://${data.id}`;
}

// ── Step 3: Build NFT Metadata JSON ──────────────────────────────────────────

function buildNftMetadata(
  questId: string,
  photoUri: string,
  gps: GpsReading,
  capture: CaptureResult
): object {
  return {
    name: `EcoQuest Proof #${questId}`,
    symbol: 'ECOQ',
    description: 'Verified proof of eco-activity completion on EcoQuest Mobile.',
    image: photoUri,
    external_url: 'https://ecoquest.app',
    attributes: [
      { trait_type: 'Quest ID', value: questId },
      { trait_type: 'Latitude', value: gps.latitude.toFixed(6) },
      { trait_type: 'Longitude', value: gps.longitude.toFixed(6) },
      { trait_type: 'Captured At', value: capture.capturedAt },
      { trait_type: 'Integrity Hash', value: capture.integrityHash },
      { trait_type: 'GPS Accuracy (m)', value: gps.accuracy?.toFixed(1) ?? 'N/A' },
      { trait_type: 'Anti-Cheat', value: 'Passed' },
    ],
    properties: {
      files: [{ uri: photoUri, type: 'image/jpeg' }],
      category: 'image',
    },
  };
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Full decentralized upload pipeline.
 *
 * 1. Compress photo
 * 2. Upload photo to Pinata (with 3x retry), fallback to Irys
 * 3. Upload JSON metadata to same provider
 * 4. Return UploadResult
 *
 * @example
 * const result = await uploadToDecentralizedStorage(questId, capture, gps);
 * console.log(result.metadataUri); // "ipfs://Qm..."
 */
export async function uploadToDecentralizedStorage(
  questId: string,
  capture: CaptureResult,
  gps: GpsReading,
  signal?: AbortSignal,
): Promise<UploadResult> {
  // ── Compress ─────────────────────────────────────────────────────────────
  console.log('[Upload] Compressing photo...');
  const compressedUri = await compressPhoto(capture.uri);

  if (signal?.aborted) throw new Error('Upload cancelled.');

  // ── Try Pinata first ──────────────────────────────────────────────────────
  if (PINATA_API_KEY && PINATA_SECRET_KEY) {
    try {
      console.log('[Upload] Uploading photo to Pinata IPFS...');
      const photoUri = await withRetry(
        () => uploadPhotoToPinata(compressedUri),
        'Pinata photo upload'
      );

      if (signal?.aborted) throw new Error('Upload cancelled.');

      const metadata = buildNftMetadata(questId, photoUri, gps, capture);

      console.log('[Upload] Uploading metadata to Pinata IPFS...');
      const metadataUri = await withRetry(
        () => uploadMetadataToPinata(metadata),
        'Pinata metadata upload'
      );

      const cid = metadataUri.replace('ipfs://', '');
      return {
        photoUri,
        metadataUri,
        provider: 'pinata',
        gatewayUrl: `${PINATA_GATEWAY}/${cid}`,
      };
    } catch (pinataError) {
      if (signal?.aborted) throw pinataError;
      console.warn('[Upload] Pinata failed, falling back to Irys...', pinataError);
    }
  } else {
    console.warn('[Upload] Pinata API keys not configured. Falling back to Irys.');
  }

  if (signal?.aborted) throw new Error('Upload cancelled.');

  // ── Fallback: Irys (Arweave) ──────────────────────────────────────────────
  console.log('[Upload] Uploading photo to Irys (Arweave)...');
  const photoUri = await withRetry(
    () => uploadPhotoToIrys(compressedUri),
    'Irys photo upload'
  );

  if (signal?.aborted) throw new Error('Upload cancelled.');

  const metadata = buildNftMetadata(questId, photoUri, gps, capture);

  console.log('[Upload] Uploading metadata to Irys (Arweave)...');
  const metadataUri = await withRetry(
    () => uploadMetadataToIrys(metadata),
    'Irys metadata upload'
  );

  const txId = metadataUri.replace('ar://', '');
  return {
    photoUri,
    metadataUri,
    provider: 'irys',
    gatewayUrl: `${ARWEAVE_GATEWAY}/${txId}`,
  };
}
