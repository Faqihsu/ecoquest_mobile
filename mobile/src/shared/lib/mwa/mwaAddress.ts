/**
 * shared/lib/mwa/mwaAddress.ts
 *
 * Converts MWA Base64-encoded addresses to @solana/web3.js PublicKey.
 *
 * The Solana Mobile Wallet Adapter protocol returns account addresses
 * as Base64-encoded strings (type Base64EncodedAddress), NOT base58.
 * Passing a Base64 string directly to `new PublicKey()` causes:
 *   "Non-base58 character" error
 *
 * This utility decodes Base64 → bytes → PublicKey.
 */
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

/**
 * Convert an MWA Base64-encoded address to a PublicKey.
 *
 * @param base64Address - The Base64-encoded address from MWA authorize()
 * @returns A valid Solana PublicKey
 * @throws If the decoded bytes don't form a valid 32-byte public key
 */
export function toPublicKeyFromBase64(base64Address: string): PublicKey {
  const bytes = Buffer.from(base64Address, 'base64');
  return new PublicKey(bytes);
}
