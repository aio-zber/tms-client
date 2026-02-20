/**
 * Group Crypto Service
 * Implements Sender Keys for efficient group encryption
 *
 * Sender Keys pattern (used by Signal, WhatsApp, Viber):
 * - Each member generates a Sender Key for each group
 * - Sender Key distributed to other members via 1:1 encrypted channels
 * - Messages encrypted once with Sender Key, all members can decrypt
 * - Re-key required when members added/removed
 *
 * Benefits:
 * - O(1) encryption instead of O(n) for n members
 * - Still maintains forward secrecy via chain ratcheting
 */

import {
  generateSigningKeyPair,
  generateKey,
  deriveKey,
  encrypt,
  decrypt,
  sign,
  randomBytes,
  toHex,
} from './cryptoService';
import {
  storeSenderKey,
  getSenderKey,
  getConversationSenderKeys,
} from '../db/cryptoDb';
import { KEY_SIZE } from '../constants';
import type {
  SenderKey,
  SenderKeyDistribution,
  EncryptedMessage,
} from '../types';
import { EncryptionError } from '../types';
import { log } from '@/lib/logger';

// KDF info for sender key chain
const KDF_SENDER_CHAIN = 'TMA-SenderKey-Chain';
const KDF_SENDER_MESSAGE = 'TMA-SenderKey-Message';

// Per-sender-key mutex: chain key read-modify-write must be serialized.
// Key = `${conversationId}:${userId}` (same as IndexedDB record ID).
const senderKeyLocks = new Map<string, Promise<void>>();

function withSenderKeyLock<T>(
  conversationId: string,
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${conversationId}:${userId}`;
  const prev = senderKeyLocks.get(key) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  senderKeyLocks.set(key, next);
  return prev.then(fn).finally(resolve) as Promise<T>;
}

// ==================== Sender Key Generation ====================

/**
 * Generate a new sender key for a group
 *
 * @param conversationId - Group conversation ID
 * @param userId - Our user ID
 */
export async function generateSenderKey(
  conversationId: string,
  userId: string
): Promise<SenderKey> {
  // Generate signing key pair for this sender key
  const signingKeyPair = generateSigningKeyPair();

  // Generate random chain key
  const chainKey = generateKey();

  // Generate unique key ID
  const keyId = toHex(randomBytes(16));

  const senderKey: SenderKey = {
    keyId,
    chainKey,
    publicSigningKey: signingKeyPair.publicKey,
    privateSigningKey: signingKeyPair.privateKey,
  };

  // Store our sender key (with private key)
  await storeSenderKey(conversationId, userId, senderKey, true);

  log.encryption.info(`Generated sender key ${keyId} for group ${conversationId}`);

  return senderKey;
}

/**
 * Get or create our sender key for a group
 */
export async function getOrCreateSenderKey(
  conversationId: string,
  userId: string
): Promise<SenderKey> {
  const existing = await getSenderKey(conversationId, userId);

  if (existing && existing.privateSigningKey) {
    return existing;
  }

  return generateSenderKey(conversationId, userId);
}

/**
 * Create a sender key distribution message
 * This should be sent to each group member via 1:1 E2EE
 */
export async function createSenderKeyDistribution(
  conversationId: string,
  userId: string
): Promise<SenderKeyDistribution> {
  const senderKey = await getOrCreateSenderKey(conversationId, userId);

  return {
    conversationId,
    senderId: userId,
    keyId: senderKey.keyId,
    chainKey: senderKey.chainKey,
    publicSigningKey: senderKey.publicSigningKey,
  };
}

/**
 * Process a received sender key distribution
 * Store the sender key for decryption
 */
export async function processSenderKeyDistribution(
  distribution: SenderKeyDistribution
): Promise<void> {
  const senderKey: SenderKey = {
    keyId: distribution.keyId,
    chainKey: distribution.chainKey,
    publicSigningKey: distribution.publicSigningKey,
    // No private key for received sender keys
  };

  await storeSenderKey(
    distribution.conversationId,
    distribution.senderId,
    senderKey,
    false
  );

  log.encryption.info(
    `Stored sender key ${distribution.keyId} from ${distribution.senderId} for group ${distribution.conversationId}`
  );
}

// ==================== Group Message Encryption ====================

/**
 * Encrypt a message for a group using sender key
 *
 * @param conversationId - Group conversation ID
 * @param userId - Our user ID (sender)
 * @param plaintext - Message to encrypt
 */
export function encryptGroupMessage(
  conversationId: string,
  userId: string,
  plaintext: Uint8Array
): Promise<EncryptedMessage> {
  return withSenderKeyLock(conversationId, userId, () => _encryptGroupMessage(conversationId, userId, plaintext));
}

async function _encryptGroupMessage(
  conversationId: string,
  userId: string,
  plaintext: Uint8Array
): Promise<EncryptedMessage> {
  const senderKey = await getOrCreateSenderKey(conversationId, userId);

  if (!senderKey.privateSigningKey) {
    throw new EncryptionError(
      'Cannot encrypt: sender key missing private signing key',
      'ENCRYPTION_FAILED'
    );
  }

  // Derive message key from current chain key (always at index 0 = current position)
  const { messageKey, nextChainKey } = deriveGroupMessageKey(senderKey.chainKey);

  // Encrypt message
  const { ciphertext, nonce } = encrypt(plaintext, messageKey);

  // Sign the ciphertext for authenticity
  sign(ciphertext, senderKey.privateSigningKey);

  // Advance the chain key in DB — both sender and recipient advance in lockstep
  senderKey.chainKey = nextChainKey;
  await storeSenderKey(conversationId, userId, senderKey, true);

  return {
    version: 2,
    ciphertext,
    nonce,
    senderKeyId: senderKey.keyId,
  };
}

/**
 * Decrypt a group message using sender key
 *
 * @param conversationId - Group conversation ID
 * @param senderId - Sender's user ID
 * @param encrypted - Encrypted message
 * @param advanceChain - Whether to advance the chain key after decryption.
 *   Pass false for own messages (sender reads their own msg) — the sender's
 *   chain is advanced only during encryption, never during self-reads.
 */
export function decryptGroupMessage(
  conversationId: string,
  senderId: string,
  encrypted: EncryptedMessage,
  advanceChain = true
): Promise<Uint8Array> {
  // Only lock when we'll actually advance the chain (non-idempotent operation)
  if (advanceChain) {
    return withSenderKeyLock(conversationId, senderId, () =>
      _decryptGroupMessage(conversationId, senderId, encrypted, true)
    );
  }
  return _decryptGroupMessage(conversationId, senderId, encrypted, false);
}

async function _decryptGroupMessage(
  conversationId: string,
  senderId: string,
  encrypted: EncryptedMessage,
  advanceChain: boolean
): Promise<Uint8Array> {
  if (!encrypted.senderKeyId) {
    throw new EncryptionError(
      'Missing sender key ID in group message',
      'INVALID_MESSAGE_FORMAT'
    );
  }

  const senderKey = await getSenderKey(conversationId, senderId);

  if (!senderKey) {
    throw new EncryptionError(
      `No sender key found for ${senderId} in group ${conversationId}`,
      'SESSION_NOT_FOUND'
    );
  }

  if (senderKey.keyId !== encrypted.senderKeyId) {
    throw new EncryptionError(
      `Sender key ID mismatch: expected ${senderKey.keyId}, got ${encrypted.senderKeyId}`,
      'INVALID_MESSAGE_FORMAT'
    );
  }

  // Derive message key from current chain key (same as sender: always at current position)
  const { messageKey, nextChainKey } = deriveGroupMessageKey(senderKey.chainKey);

  // Decrypt message
  let plaintext: Uint8Array;
  try {
    plaintext = decrypt(encrypted.ciphertext, encrypted.nonce, messageKey);
  } catch (error) {
    throw new EncryptionError(
      'Failed to decrypt group message',
      'DECRYPTION_FAILED',
      error as Error
    );
  }

  // Advance the chain key in DB — keeps recipient in lockstep with sender.
  // Skip for own-message reads: sender's chain is only advanced by encrypt.
  if (advanceChain) {
    senderKey.chainKey = nextChainKey;
    await storeSenderKey(conversationId, senderId, senderKey, false);
  }

  return plaintext;
}

// ==================== Key Derivation ====================

/**
 * Derive message key and next chain key from the current chain key.
 *
 * Both sender and recipient call this at their current chain position,
 * then store nextChainKey — keeping them in lockstep without needing
 * to pass a chain index in the message envelope.
 */
function deriveGroupMessageKey(
  chainKey: Uint8Array
): { messageKey: Uint8Array; nextChainKey: Uint8Array } {
  const messageKey = deriveKey(chainKey, KDF_SENDER_MESSAGE, KEY_SIZE);
  const nextChainKey = deriveKey(chainKey, KDF_SENDER_CHAIN, KEY_SIZE);
  return { messageKey, nextChainKey };
}

// ==================== Group Management ====================

/**
 * Rotate sender key (required when members change)
 *
 * @param conversationId - Group conversation ID
 * @param userId - Our user ID
 */
export async function rotateSenderKey(
  conversationId: string,
  userId: string
): Promise<SenderKey> {
  // Generate new sender key
  const newSenderKey = await generateSenderKey(conversationId, userId);

  log.encryption.info(`Rotated sender key for group ${conversationId}`);

  return newSenderKey;
}

/**
 * Check if we have sender keys for all group members
 */
export async function hasAllSenderKeys(
  conversationId: string,
  memberIds: string[]
): Promise<boolean> {
  const keys = await getConversationSenderKeys(conversationId);
  const keyUserIds = new Set(keys.map((k) => k.userId));

  return memberIds.every((id) => keyUserIds.has(id));
}

/**
 * Get missing sender keys (members we don't have keys for)
 */
export async function getMissingSenderKeys(
  conversationId: string,
  memberIds: string[]
): Promise<string[]> {
  const keys = await getConversationSenderKeys(conversationId);
  const keyUserIds = new Set(keys.map((k) => k.userId));

  return memberIds.filter((id) => !keyUserIds.has(id));
}

/**
 * Check if sender key exists for a user in a group
 */
export async function hasSenderKey(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const key = await getSenderKey(conversationId, userId);
  return key !== null;
}

// Export group crypto service object
export const groupCryptoService = {
  generateSenderKey,
  getOrCreateSenderKey,
  createSenderKeyDistribution,
  processSenderKeyDistribution,
  encryptGroupMessage,
  decryptGroupMessage,
  rotateSenderKey,
  hasAllSenderKeys,
  getMissingSenderKeys,
  hasSenderKey,
};

export default groupCryptoService;
