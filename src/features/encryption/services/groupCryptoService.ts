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
export async function encryptGroupMessage(
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

  // Derive message key from chain key
  const { messageKey, nextChainKey, chainIndex } = deriveGroupMessageKey(
    senderKey.chainKey,
    0 // Chain index stored in DB, simplified here
  );

  // Encrypt message
  const { ciphertext, nonce } = encrypt(plaintext, messageKey);

  // Sign the ciphertext for authenticity
  // Note: In production, include signature in message for verification
  sign(ciphertext, senderKey.privateSigningKey);

  // Update chain key (in production, persist this)
  senderKey.chainKey = nextChainKey;
  await storeSenderKey(conversationId, userId, senderKey, true);

  return {
    version: 1,
    ciphertext,
    nonce,
    senderKeyId: senderKey.keyId,
    messageNumber: chainIndex,
  };
}

/**
 * Decrypt a group message using sender key
 *
 * @param conversationId - Group conversation ID
 * @param senderId - Sender's user ID
 * @param encrypted - Encrypted message
 */
export async function decryptGroupMessage(
  conversationId: string,
  senderId: string,
  encrypted: EncryptedMessage
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

  // Derive message key (may need to skip ahead)
  const messageNumber = encrypted.messageNumber ?? 0;
  const { messageKey } = deriveGroupMessageKey(senderKey.chainKey, messageNumber);

  // Decrypt message
  try {
    return decrypt(encrypted.ciphertext, encrypted.nonce, messageKey);
  } catch (error) {
    throw new EncryptionError(
      'Failed to decrypt group message',
      'DECRYPTION_FAILED',
      error as Error
    );
  }
}

// ==================== Key Derivation ====================

/**
 * Derive message key from sender chain key
 */
function deriveGroupMessageKey(
  chainKey: Uint8Array,
  targetIndex: number
): { messageKey: Uint8Array; nextChainKey: Uint8Array; chainIndex: number } {
  let currentChainKey = chainKey;
  let chainIndex = 0;

  // Ratchet forward to target index
  while (chainIndex < targetIndex) {
    currentChainKey = deriveKey(currentChainKey, KDF_SENDER_CHAIN, KEY_SIZE);
    chainIndex++;
  }

  // Derive message key
  const messageKey = deriveKey(currentChainKey, KDF_SENDER_MESSAGE, KEY_SIZE);

  // Derive next chain key
  const nextChainKey = deriveKey(currentChainKey, KDF_SENDER_CHAIN, KEY_SIZE);

  return { messageKey, nextChainKey, chainIndex: chainIndex + 1 };
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
