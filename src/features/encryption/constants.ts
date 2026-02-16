/**
 * E2EE Constants
 * Cryptographic parameters and configuration for end-to-end encryption
 */

// Encryption algorithm identifiers
export const ENCRYPTION_VERSION = 2;
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

// Conversation Key Parameters
export const CONVERSATION_KEY_INFO = 'TMA-ConversationKey';

// IndexedDB Configuration
export const CRYPTO_DB_NAME = 'tma-e2ee-keys';
export const CRYPTO_DB_VERSION = 6;

// Key Backup Configuration
export const BACKUP_VERSION = 1;
export const PIN_LENGTH = 6;
export const KDF_OPS_LIMIT = 3;       // crypto_pwhash_OPSLIMIT_MODERATE
export const KDF_MEM_LIMIT = 67108864; // 64MB - crypto_pwhash_MEMLIMIT_MODERATE
export const KDF_SALT_LENGTH = 16;

// Store names
export const IDENTITY_STORE = 'identity';
export const PREKEY_STORE = 'prekeys';
export const SESSION_STORE = 'sessions';
export const SENDER_KEY_STORE = 'senderKeys';
export const MESSAGE_KEY_STORE = 'messageKeys';

// Key bundle TTL
export const KEY_BUNDLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
