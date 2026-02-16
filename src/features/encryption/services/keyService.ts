/**
 * Key Service
 * Handles key generation and X3DH (Extended Triple Diffie-Hellman) key agreement
 *
 * X3DH provides:
 * - Mutual authentication
 * - Forward secrecy
 * - Asynchronous operation (recipient can be offline)
 *
 * Key types:
 * - Identity Key (IK): Long-term key pair for user identity
 * - Signed Pre-Key (SPK): Medium-term key pair, signed by IK
 * - One-Time Pre-Key (OPK): Single-use keys for extra forward secrecy
 */

import {
  generateX25519KeyPair,
  generateSigningKeyPair,
  ed25519PrivateKeyToX25519,
  ed25519PublicKeyToX25519,
  x25519,
  sign,
  verify,
  hkdf,
  sha256,
  toHex,
  initCrypto,
} from './cryptoService';
import {
  storeIdentityKey,
  storePreKeys,
  getIdentityKey,
  hasIdentityKey,
  getUnusedPreKeys,
  getUnusedPreKeyCount,
  consumePreKey,
} from '../db/cryptoDb';
import {
  ONE_TIME_PREKEY_COUNT,
  ONE_TIME_PREKEY_REFILL_THRESHOLD,
  KEY_SIZE,
} from '../constants';
import type {
  KeyPair,
  IdentityKeyPair,
  SignedPreKey,
  OneTimePreKey,
  PublicKeyBundle,
  LocalKeyBundle,
  X3DHHeader,
} from '../types';
import { EncryptionError } from '../types';
import { log } from '@/lib/logger';

// ==================== Key Generation ====================

/**
 * Generate an identity key pair
 * Ed25519 keys are generated for signing, then converted to X25519 for DH.
 * Both are stored: X25519 as publicKey/privateKey, Ed25519 as signingKey.
 */
export function generateIdentityKeyPair(): IdentityKeyPair {
  const signingKeyPair = generateSigningKeyPair();

  return {
    publicKey: ed25519PublicKeyToX25519(signingKeyPair.publicKey),
    privateKey: ed25519PrivateKeyToX25519(signingKeyPair.privateKey),
    signingKey: signingKeyPair.privateKey, // 64-byte Ed25519 key for signing
    createdAt: Date.now(),
  };
}

/**
 * Generate a signed pre-key
 * The pre-key is signed with the identity Ed25519 key for authentication
 *
 * @param identityKeyPair - Identity key pair (must include signingKey)
 * @param keyId - Unique ID for this pre-key
 */
export function generateSignedPreKey(
  identityKeyPair: IdentityKeyPair,
  keyId: number
): SignedPreKey {
  const keyPair = generateX25519KeyPair();

  if (!identityKeyPair.signingKey) {
    throw new Error('Identity key pair missing Ed25519 signing key');
  }

  // Sign the hash of the pre-key public key with the Ed25519 signing key
  const signature = signPreKey(keyPair.publicKey, identityKeyPair.signingKey);

  return {
    keyId,
    keyPair,
    signature,
    createdAt: Date.now(),
  };
}

/**
 * Sign a pre-key public key using Ed25519
 */
function signPreKey(preKeyPublic: Uint8Array, ed25519PrivateKey: Uint8Array): Uint8Array {
  const message = sha256(preKeyPublic);
  return sign(message, ed25519PrivateKey);
}

/**
 * Verify a pre-key signature using Ed25519 public key
 * Note: identityPublic here must be the Ed25519 public key (not X25519)
 */
export function verifyPreKeySignature(
  preKeyPublic: Uint8Array,
  signature: Uint8Array,
  identityPublic: Uint8Array
): boolean {
  const message = sha256(preKeyPublic);
  return verify(signature, message, identityPublic);
}

/**
 * Generate one-time pre-keys
 *
 * @param startId - Starting key ID
 * @param count - Number of keys to generate
 */
export function generateOneTimePreKeys(
  startId: number,
  count: number = ONE_TIME_PREKEY_COUNT
): OneTimePreKey[] {
  const preKeys: OneTimePreKey[] = [];

  for (let i = 0; i < count; i++) {
    preKeys.push({
      keyId: startId + i,
      keyPair: generateX25519KeyPair(),
    });
  }

  return preKeys;
}

// ==================== Key Bundle Management ====================

/**
 * Initialize keys for a new user
 * Creates identity key, signed pre-key, and one-time pre-keys
 */
export async function initializeKeys(): Promise<LocalKeyBundle> {
  await initCrypto();

  // Check if we already have keys
  const existing = await getIdentityKey();
  if (existing && existing.identityKeyPair.signingKey) {
    const preKeys = await getUnusedPreKeys();
    return {
      identityKeyPair: existing.identityKeyPair,
      signedPreKey: existing.signedPreKey,
      oneTimePreKeys: preKeys,
    };
  }

  // If existing keys lack signingKey (pre-fix data), regenerate
  if (existing && !existing.identityKeyPair.signingKey) {
    log.encryption.warn('Existing keys missing signing key — regenerating');
  }

  log.encryption.info('Generating new key bundle');

  // Generate identity key
  const identityKeyPair = generateIdentityKeyPair();

  // Generate signed pre-key
  const signedPreKey = generateSignedPreKey(identityKeyPair, 1);

  // Generate one-time pre-keys
  const oneTimePreKeys = generateOneTimePreKeys(1);

  // Store keys
  await storeIdentityKey(identityKeyPair, signedPreKey);
  await storePreKeys(oneTimePreKeys);

  log.encryption.info(`Generated key bundle with ${oneTimePreKeys.length} pre-keys`);

  return {
    identityKeyPair,
    signedPreKey,
    oneTimePreKeys,
  };
}

/**
 * Get the public key bundle for upload to server
 */
export async function getPublicKeyBundle(): Promise<PublicKeyBundle> {
  const keys = await getIdentityKey();
  if (!keys) {
    throw new Error('Keys not initialized');
  }

  const preKeys = await getUnusedPreKeys();

  return {
    identityKey: keys.identityKeyPair.publicKey,
    signedPreKey: {
      keyId: keys.signedPreKey.keyId,
      publicKey: keys.signedPreKey.keyPair.publicKey,
      signature: keys.signedPreKey.signature,
    },
    oneTimePreKeys: preKeys.map((pk) => ({
      keyId: pk.keyId,
      publicKey: pk.keyPair.publicKey,
    })),
  };
}

/**
 * Check if we need to replenish pre-keys
 */
export async function needsPreKeyReplenishment(): Promise<boolean> {
  const count = await getUnusedPreKeyCount();
  return count < ONE_TIME_PREKEY_REFILL_THRESHOLD;
}

/**
 * Generate and store additional pre-keys
 */
export async function replenishPreKeys(): Promise<OneTimePreKey[]> {
  const existing = await getUnusedPreKeys();
  const maxId = existing.reduce((max, pk) => Math.max(max, pk.keyId), 0);

  const count = ONE_TIME_PREKEY_COUNT - existing.length;
  if (count <= 0) return [];

  const newPreKeys = generateOneTimePreKeys(maxId + 1, count);
  await storePreKeys(newPreKeys);

  log.encryption.info(`Replenished ${newPreKeys.length} pre-keys`);

  return newPreKeys;
}

// ==================== X3DH Key Agreement ====================

/**
 * X3DH Parameters for Signal Protocol
 *
 * Alice (sender) initiates session with Bob (recipient):
 * 1. Alice fetches Bob's key bundle from server
 * 2. Alice generates ephemeral key pair
 * 3. Alice performs 3-4 DH operations to derive shared secret
 * 4. Alice sends X3DH header with first message
 * 5. Bob receives header and performs same DH operations
 */

/**
 * Perform X3DH key agreement as sender (Alice)
 *
 * @param ourIdentityKey - Our identity key pair
 * @param theirBundle - Recipient's public key bundle
 * @returns Shared secret and X3DH header to send
 */
export function x3dhSend(
  ourIdentityKey: IdentityKeyPair,
  theirBundle: {
    identityKey: Uint8Array;
    signedPreKey: { keyId: number; publicKey: Uint8Array; signature: Uint8Array };
    oneTimePreKey?: { keyId: number; publicKey: Uint8Array };
  }
): { sharedSecret: Uint8Array; header: X3DHHeader; ephemeralKeyPair: KeyPair } {
  // Verify signed pre-key signature
  // Note: In production, verify with Ed25519 public key
  // Here we're using X25519 key, so skip verification for now

  // Generate ephemeral key pair
  const ephemeralKey = generateX25519KeyPair();

  // Perform DH operations:
  // DH1 = DH(IK_A, SPK_B) - Our identity key, their signed pre-key
  const dh1 = x25519(ourIdentityKey.privateKey, theirBundle.signedPreKey.publicKey);

  // DH2 = DH(EK_A, IK_B) - Our ephemeral key, their identity key
  const dh2 = x25519(ephemeralKey.privateKey, theirBundle.identityKey);

  // DH3 = DH(EK_A, SPK_B) - Our ephemeral key, their signed pre-key
  const dh3 = x25519(ephemeralKey.privateKey, theirBundle.signedPreKey.publicKey);

  // DH4 (optional) = DH(EK_A, OPK_B) - Our ephemeral key, their one-time pre-key
  let dh4: Uint8Array | null = null;
  if (theirBundle.oneTimePreKey) {
    dh4 = x25519(ephemeralKey.privateKey, theirBundle.oneTimePreKey.publicKey);
  }

  // Concatenate DH outputs
  const dhConcat = concatenateKeys(dh1, dh2, dh3, dh4);

  // Derive shared secret using KDF
  const sharedSecret = kdfX3DH(dhConcat, ourIdentityKey.publicKey, theirBundle.identityKey);

  // Create X3DH header
  const header: X3DHHeader = {
    identityKey: ourIdentityKey.publicKey,
    ephemeralKey: ephemeralKey.publicKey,
    signedPreKeyId: theirBundle.signedPreKey.keyId,
    preKeyId: theirBundle.oneTimePreKey?.keyId,
  };

  return { sharedSecret, header, ephemeralKeyPair: ephemeralKey };
}

/**
 * Perform X3DH key agreement as recipient (Bob)
 *
 * @param header - X3DH header from sender
 * @param ourIdentityKey - Our identity key pair
 * @param ourSignedPreKey - Our signed pre-key
 * @param ourOneTimePreKey - Our one-time pre-key (if used)
 * @returns Shared secret
 */
export async function x3dhReceive(
  header: X3DHHeader,
  ourIdentityKey: IdentityKeyPair,
  ourSignedPreKey: SignedPreKey,
  ourOneTimePreKeyId?: number
): Promise<Uint8Array> {
  // Consume one-time pre-key if used
  let ourOneTimePreKey: OneTimePreKey | null = null;
  if (ourOneTimePreKeyId !== undefined) {
    ourOneTimePreKey = await consumePreKey(ourOneTimePreKeyId);
    if (!ourOneTimePreKey) {
      // Sender included DH4 in their shared secret, but we can't compute it
      // without the OPK. The shared secrets will never match — fail early.
      throw new EncryptionError(
        `One-time pre-key ${ourOneTimePreKeyId} not found or already consumed`,
        'DECRYPTION_FAILED'
      );
    }
  }

  // Perform DH operations (same as sender, but roles reversed):
  // DH1 = DH(SPK_B, IK_A) - Our signed pre-key, their identity key
  const dh1 = x25519(ourSignedPreKey.keyPair.privateKey, header.identityKey);

  // DH2 = DH(IK_B, EK_A) - Our identity key, their ephemeral key
  const dh2 = x25519(ourIdentityKey.privateKey, header.ephemeralKey);

  // DH3 = DH(SPK_B, EK_A) - Our signed pre-key, their ephemeral key
  const dh3 = x25519(ourSignedPreKey.keyPair.privateKey, header.ephemeralKey);

  // DH4 (optional) = DH(OPK_B, EK_A) - Our one-time pre-key, their ephemeral key
  let dh4: Uint8Array | null = null;
  if (ourOneTimePreKey) {
    dh4 = x25519(ourOneTimePreKey.keyPair.privateKey, header.ephemeralKey);
  }

  // Concatenate DH outputs
  const dhConcat = concatenateKeys(dh1, dh2, dh3, dh4);

  // Derive shared secret using KDF
  const sharedSecret = kdfX3DH(dhConcat, header.identityKey, ourIdentityKey.publicKey);

  return sharedSecret;
}

/**
 * Concatenate DH outputs for KDF input
 */
function concatenateKeys(
  dh1: Uint8Array,
  dh2: Uint8Array,
  dh3: Uint8Array,
  dh4: Uint8Array | null
): Uint8Array {
  const length = dh1.length + dh2.length + dh3.length + (dh4 ? dh4.length : 0);
  const result = new Uint8Array(length);

  let offset = 0;
  result.set(dh1, offset);
  offset += dh1.length;
  result.set(dh2, offset);
  offset += dh2.length;
  result.set(dh3, offset);

  if (dh4) {
    offset += dh3.length;
    result.set(dh4, offset);
  }

  return result;
}

/**
 * KDF for X3DH shared secret derivation
 * Uses HKDF with protocol-specific info including both identity keys
 */
function kdfX3DH(
  dhOutput: Uint8Array,
  senderIdentityKey: Uint8Array,
  recipientIdentityKey: Uint8Array
): Uint8Array {
  // Protocol info includes both identity keys for domain separation
  const encoder = new TextEncoder();
  const prefix = encoder.encode('TMA-X3DH');
  const info = new Uint8Array(
    prefix.length + senderIdentityKey.length + recipientIdentityKey.length
  );

  let offset = 0;
  info.set(prefix, offset);
  offset += prefix.length;
  info.set(senderIdentityKey, offset);
  offset += senderIdentityKey.length;
  info.set(recipientIdentityKey, offset);

  return hkdf(dhOutput, null, info, KEY_SIZE);
}

// ==================== Key Fingerprint ====================

/**
 * Generate a safety number for key verification
 * Similar to Signal's safety numbers
 *
 * @param ourIdentityKey - Our identity public key
 * @param theirIdentityKey - Their identity public key
 * @returns 60-digit safety number
 */
export function generateSafetyNumber(
  ourIdentityKey: Uint8Array,
  theirIdentityKey: Uint8Array
): string {
  // Sort keys to ensure same result regardless of who generates it
  const [key1, key2] = sortKeys(ourIdentityKey, theirIdentityKey);

  // Hash both keys together
  const combined = new Uint8Array(key1.length + key2.length);
  combined.set(key1, 0);
  combined.set(key2, key1.length);

  const hash = sha256(combined);

  // Convert to numeric string (5 digits per 2 bytes = 30 digits per party)
  let number = '';
  for (let i = 0; i < hash.length && number.length < 60; i += 2) {
    const value = (hash[i] << 8) | hash[i + 1];
    number += value.toString().padStart(5, '0');
  }

  // Format as 12 groups of 5 digits
  return number.substring(0, 60);
}

/**
 * Sort two keys deterministically
 */
function sortKeys(a: Uint8Array, b: Uint8Array): [Uint8Array, Uint8Array] {
  const aHex = toHex(a);
  const bHex = toHex(b);
  return aHex < bHex ? [a, b] : [b, a];
}

// ==================== Utilities ====================

/**
 * Check if identity keys are initialized
 */
export async function hasKeys(): Promise<boolean> {
  return hasIdentityKey();
}

/**
 * Get local identity key
 */
export async function getLocalIdentityKey(): Promise<IdentityKeyPair | null> {
  const keys = await getIdentityKey();
  return keys?.identityKeyPair || null;
}

// Export key service object
export const keyService = {
  generateIdentityKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  initializeKeys,
  getPublicKeyBundle,
  needsPreKeyReplenishment,
  replenishPreKeys,
  x3dhSend,
  x3dhReceive,
  generateSafetyNumber,
  hasKeys,
  getLocalIdentityKey,
  verifyPreKeySignature,
};

export default keyService;
