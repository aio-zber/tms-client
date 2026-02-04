/**
 * E2EE Constants
 * Cryptographic parameters and configuration for end-to-end encryption
 */

// Encryption algorithm identifiers
export const ENCRYPTION_VERSION = 1;
export const ALGORITHM = 'AES-256-GCM';

// Key sizes in bytes
export const KEY_SIZE = 32; // 256 bits for AES-256
export const NONCE_SIZE = 24; // 192 bits for XChaCha20 nonce (libsodium)
export const AUTH_TAG_SIZE = 16; // 128 bits for GCM auth tag

// X3DH Parameters
export const IDENTITY_KEY_TYPE = 'X25519';
export const SIGNED_PREKEY_ROTATION_DAYS = 7;
export const ONE_TIME_PREKEY_COUNT = 100;
export const ONE_TIME_PREKEY_REFILL_THRESHOLD = 25;

// Double Ratchet Parameters
export const MAX_SKIP = 1000; // Maximum skipped message keys to store
export const CHAIN_KEY_CONSTANT = new Uint8Array([0x01]); // For chain key derivation
export const MESSAGE_KEY_CONSTANT = new Uint8Array([0x02]); // For message key derivation

// IndexedDB Configuration
export const CRYPTO_DB_NAME = 'tma-e2ee-keys';
export const CRYPTO_DB_VERSION = 1;

// Store names
export const IDENTITY_STORE = 'identity';
export const PREKEY_STORE = 'prekeys';
export const SESSION_STORE = 'sessions';
export const SENDER_KEY_STORE = 'senderKeys';
export const MESSAGE_KEY_STORE = 'messageKeys';

// Key bundle TTL
export const KEY_BUNDLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
