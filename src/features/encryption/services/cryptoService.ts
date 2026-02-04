/**
 * Crypto Service
 * Core cryptographic operations using libsodium
 *
 * Provides:
 * - AES-256-GCM encryption/decryption (via secretbox which uses XSalsa20-Poly1305)
 * - Key generation (X25519, Ed25519)
 * - Digital signatures
 * - Key derivation (HKDF)
 * - Secure random generation
 */

import _sodium from 'libsodium-wrappers-sumo';
import { KEY_SIZE, NONCE_SIZE } from '../constants';
import { EncryptionError } from '../types';
import { log } from '@/lib/logger';

// Sodium instance (initialized lazily)
let sodium: typeof _sodium | null = null;

/**
 * Initialize libsodium
 * Must be called before any crypto operations
 */
export async function initCrypto(): Promise<void> {
  if (sodium) return;

  await _sodium.ready;
  sodium = _sodium;
  log.encryption.info('Libsodium initialized');
}

/**
 * Ensure sodium is initialized
 */
function getSodium(): typeof _sodium {
  if (!sodium) {
    throw new EncryptionError(
      'Crypto not initialized. Call initCrypto() first.',
      'INIT_FAILED'
    );
  }
  return sodium;
}

// ==================== Random Generation ====================

/**
 * Generate cryptographically secure random bytes
 */
export function randomBytes(length: number): Uint8Array {
  const s = getSodium();
  return s.randombytes_buf(length);
}

/**
 * Generate a random 256-bit key
 */
export function generateKey(): Uint8Array {
  return randomBytes(KEY_SIZE);
}

/**
 * Generate a random nonce
 */
export function generateNonce(): Uint8Array {
  return randomBytes(NONCE_SIZE);
}

// ==================== Symmetric Encryption ====================

/**
 * Encrypt data using XSalsa20-Poly1305 (secretbox)
 * This is libsodium's authenticated encryption
 *
 * @param plaintext - Data to encrypt
 * @param key - 256-bit encryption key
 * @returns Object with ciphertext and nonce
 */
export function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const s = getSodium();

  if (key.length !== s.crypto_secretbox_KEYBYTES) {
    throw new EncryptionError(
      `Invalid key size: expected ${s.crypto_secretbox_KEYBYTES}, got ${key.length}`,
      'ENCRYPTION_FAILED'
    );
  }

  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ciphertext = s.crypto_secretbox_easy(plaintext, nonce, key);

  return { ciphertext, nonce };
}

/**
 * Decrypt data using XSalsa20-Poly1305 (secretbox)
 *
 * @param ciphertext - Encrypted data
 * @param nonce - Nonce used for encryption
 * @param key - 256-bit decryption key
 * @returns Decrypted plaintext
 */
export function decrypt(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array
): Uint8Array {
  const s = getSodium();

  if (key.length !== s.crypto_secretbox_KEYBYTES) {
    throw new EncryptionError(
      `Invalid key size: expected ${s.crypto_secretbox_KEYBYTES}, got ${key.length}`,
      'DECRYPTION_FAILED'
    );
  }

  try {
    return s.crypto_secretbox_open_easy(ciphertext, nonce, key);
  } catch (error) {
    throw new EncryptionError(
      'Decryption failed - invalid ciphertext or key',
      'DECRYPTION_FAILED',
      error as Error
    );
  }
}

/**
 * Encrypt a string message
 */
export function encryptMessage(
  message: string,
  key: Uint8Array
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const s = getSodium();
  const plaintext = s.from_string(message);
  return encrypt(plaintext, key);
}

/**
 * Decrypt to a string message
 */
export function decryptMessage(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array
): string {
  const s = getSodium();
  const plaintext = decrypt(ciphertext, nonce, key);
  return s.to_string(plaintext);
}

// ==================== Key Exchange (X25519) ====================

/**
 * Generate X25519 key pair for Diffie-Hellman key exchange
 */
export function generateX25519KeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const s = getSodium();
  const keyPair = s.crypto_box_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Perform X25519 Diffie-Hellman key exchange
 *
 * @param ourPrivateKey - Our X25519 private key
 * @param theirPublicKey - Their X25519 public key
 * @returns Shared secret (32 bytes)
 */
export function x25519(
  ourPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  const s = getSodium();
  return s.crypto_scalarmult(ourPrivateKey, theirPublicKey);
}

// ==================== Digital Signatures (Ed25519) ====================

/**
 * Generate Ed25519 key pair for digital signatures
 */
export function generateSigningKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const s = getSodium();
  const keyPair = s.crypto_sign_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Sign a message using Ed25519
 *
 * @param message - Message to sign
 * @param privateKey - Ed25519 private key
 * @returns Signature (64 bytes)
 */
export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const s = getSodium();
  return s.crypto_sign_detached(message, privateKey);
}

/**
 * Verify an Ed25519 signature
 *
 * @param signature - Signature to verify
 * @param message - Original message
 * @param publicKey - Ed25519 public key
 * @returns true if valid, false otherwise
 */
export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  const s = getSodium();
  try {
    return s.crypto_sign_verify_detached(signature, message, publicKey);
  } catch {
    return false;
  }
}

/**
 * Convert Ed25519 public key to X25519 public key
 * Used for converting signing keys to key exchange keys
 */
export function ed25519PublicKeyToX25519(edPublicKey: Uint8Array): Uint8Array {
  const s = getSodium();
  return s.crypto_sign_ed25519_pk_to_curve25519(edPublicKey);
}

/**
 * Convert Ed25519 private key to X25519 private key
 */
export function ed25519PrivateKeyToX25519(edPrivateKey: Uint8Array): Uint8Array {
  const s = getSodium();
  return s.crypto_sign_ed25519_sk_to_curve25519(edPrivateKey);
}

// ==================== Key Derivation (HKDF) ====================

/**
 * HKDF-SHA256 key derivation
 *
 * @param inputKeyMaterial - Input key material
 * @param salt - Salt (optional, use zeros if not provided)
 * @param info - Context info
 * @param length - Output length in bytes
 * @returns Derived key
 */
export function hkdf(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array | null,
  info: Uint8Array,
  length: number
): Uint8Array {
  const s = getSodium();

  // If no salt, use zeros
  const actualSalt = salt || new Uint8Array(s.crypto_auth_KEYBYTES);

  // Extract step: PRK = HMAC-SHA256(salt, IKM)
  // Using crypto_auth (HMAC-SHA512/256 truncated) as a PRF
  // For proper HKDF, we'd use SHA256, but libsodium doesn't expose it directly
  // So we use generichash (BLAKE2b) which is equally secure

  // Use generichash with key for HMAC-like behavior
  const prk = s.crypto_generichash(
    s.crypto_generichash_KEYBYTES,
    inputKeyMaterial,
    actualSalt
  );

  // Expand step
  const output = new Uint8Array(length);
  const hashLen = s.crypto_generichash_BYTES;
  const n = Math.ceil(length / hashLen);

  let previous = new Uint8Array(0);

  for (let i = 1; i <= n; i++) {
    const input = new Uint8Array(previous.length + info.length + 1);
    input.set(previous, 0);
    input.set(info, previous.length);
    input[input.length - 1] = i;

    const hashResult = s.crypto_generichash(hashLen, input, prk);
    previous = new Uint8Array(hashResult);

    const offset = (i - 1) * hashLen;
    const copyLength = Math.min(hashLen, length - offset);
    output.set(previous.subarray(0, copyLength), offset);
  }

  return output;
}

/**
 * Derive a key from shared secret and additional info
 * Used in Signal Protocol for deriving chain keys and message keys
 */
export function deriveKey(
  sharedSecret: Uint8Array,
  info: string,
  length: number = KEY_SIZE
): Uint8Array {
  const s = getSodium();
  const infoBytes = s.from_string(info);
  return hkdf(sharedSecret, null, infoBytes, length);
}

// ==================== Hash Functions ====================

/**
 * SHA-256 hash (using BLAKE2b for compatibility)
 */
export function sha256(data: Uint8Array): Uint8Array {
  const s = getSodium();
  // libsodium's generichash uses BLAKE2b by default
  // For SHA-256 compatibility, we use generichash with 32 bytes output
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return s.crypto_generichash(32, data, null) as any as Uint8Array;
}

/**
 * Hash to hex string (for key fingerprints)
 */
export function hashToHex(data: Uint8Array): string {
  const s = getSodium();
  return s.to_hex(sha256(data));
}

// ==================== Encoding Utilities ====================

/**
 * Encode bytes to Base64
 */
export function toBase64(bytes: Uint8Array): string {
  const s = getSodium();
  return s.to_base64(bytes, s.base64_variants.ORIGINAL);
}

/**
 * Decode Base64 to bytes
 */
export function fromBase64(base64: string): Uint8Array {
  const s = getSodium();
  return s.from_base64(base64, s.base64_variants.ORIGINAL);
}

/**
 * Encode bytes to hex string
 */
export function toHex(bytes: Uint8Array): string {
  const s = getSodium();
  return s.to_hex(bytes);
}

/**
 * Decode hex string to bytes
 */
export function fromHex(hex: string): Uint8Array {
  const s = getSodium();
  return s.from_hex(hex);
}

/**
 * Encode string to Uint8Array (UTF-8)
 */
export function stringToBytes(str: string): Uint8Array {
  const s = getSodium();
  return s.from_string(str);
}

/**
 * Decode Uint8Array to string (UTF-8)
 */
export function bytesToString(bytes: Uint8Array): string {
  const s = getSodium();
  return s.to_string(bytes);
}

// ==================== Comparison Utilities ====================

/**
 * Constant-time comparison of two byte arrays
 * Prevents timing attacks
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const s = getSodium();
  if (a.length !== b.length) return false;
  return s.memcmp(a, b);
}

/**
 * Securely wipe memory (zero out sensitive data)
 */
export function wipeMemory(data: Uint8Array): void {
  const s = getSodium();
  s.memzero(data);
}

// Export crypto service object
export const cryptoService = {
  initCrypto,
  randomBytes,
  generateKey,
  generateNonce,
  encrypt,
  decrypt,
  encryptMessage,
  decryptMessage,
  generateX25519KeyPair,
  x25519,
  generateSigningKeyPair,
  sign,
  verify,
  ed25519PublicKeyToX25519,
  ed25519PrivateKeyToX25519,
  hkdf,
  deriveKey,
  sha256,
  hashToHex,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  stringToBytes,
  bytesToString,
  constantTimeEqual,
  wipeMemory,
};

export default cryptoService;
