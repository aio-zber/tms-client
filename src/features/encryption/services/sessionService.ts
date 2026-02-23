/**
 * Session Service
 * Per-conversation symmetric key encryption (Messenger Labyrinth-style)
 *
 * Replaces Double Ratchet with a simple model:
 * - X3DH establishes a shared secret between two parties
 * - A single conversation key is derived from that shared secret via HKDF
 * - All messages in the conversation are encrypted/decrypted with that key
 * - Encryption/decryption is idempotent — no sequential state machine
 */

import {
  deriveKey,
  encrypt,
  decrypt,
} from './cryptoService';
import {
  storeSession,
  getSession,
  deleteSession,
} from '../db/cryptoDb';
import { KEY_SIZE, CONVERSATION_KEY_INFO, ENCRYPTION_VERSION } from '../constants';
import type {
  ConversationKeySession,
  EncryptedMessage,
} from '../types';
import { EncryptionError } from '../types';
import { log } from '@/lib/logger';

// ==================== Session Initialization ====================

/**
 * Initialize a new session as sender (after X3DH)
 *
 * Derives a conversation key from the X3DH shared secret using HKDF.
 * Both sender and recipient derive the identical key from the same shared secret.
 *
 * @param conversationId - Conversation ID
 * @param remoteUserId - Remote user ID
 * @param sharedSecret - Shared secret from X3DH
 * @param remoteIdentityKey - Remote party's identity key
 */
export async function initSessionAsSender(
  conversationId: string,
  remoteUserId: string,
  sharedSecret: Uint8Array,
  remoteIdentityKey: Uint8Array
): Promise<ConversationKeySession> {
  const conversationKey = deriveKey(sharedSecret, CONVERSATION_KEY_INFO, KEY_SIZE);
  const now = Date.now();

  const session: ConversationKeySession = {
    conversationKey,
    remoteIdentityKey,
    createdAt: now,
    updatedAt: now,
  };

  await storeSession(conversationId, remoteUserId, session);
  log.encryption.info(`Session initialized as sender for ${conversationId}:${remoteUserId}`);

  return session;
}

/**
 * Initialize a new session as recipient (after X3DH)
 *
 * Same derivation as sender — both sides get the same conversation key.
 *
 * @param conversationId - Conversation ID
 * @param remoteUserId - Remote user ID
 * @param sharedSecret - Shared secret from X3DH
 * @param remoteIdentityKey - Remote party's identity key
 */
export async function initSessionAsRecipient(
  conversationId: string,
  remoteUserId: string,
  sharedSecret: Uint8Array,
  remoteIdentityKey: Uint8Array
): Promise<ConversationKeySession> {
  const conversationKey = deriveKey(sharedSecret, CONVERSATION_KEY_INFO, KEY_SIZE);
  const now = Date.now();

  const session: ConversationKeySession = {
    conversationKey,
    remoteIdentityKey,
    createdAt: now,
    updatedAt: now,
  };

  await storeSession(conversationId, remoteUserId, session);
  log.encryption.info(`Session initialized as recipient for ${conversationId}:${remoteUserId}`);

  return session;
}

// ==================== Message Encryption ====================

/**
 * Encrypt a message using the conversation key
 *
 * Stateless — does not mutate any session state. Each call generates a fresh
 * random nonce via XSalsa20-Poly1305 (libsodium secretbox).
 *
 * @param conversationId - Conversation ID
 * @param remoteUserId - Remote user ID
 * @param plaintext - Message to encrypt
 * @returns Encrypted message envelope
 */
export async function encryptWithSession(
  conversationId: string,
  remoteUserId: string,
  plaintext: Uint8Array
): Promise<{ encrypted: EncryptedMessage; session: ConversationKeySession }> {
  const session = await getSession(conversationId, remoteUserId);

  if (!session) {
    throw new EncryptionError(
      `No session found for ${conversationId}:${remoteUserId}`,
      'SESSION_NOT_FOUND'
    );
  }

  const { ciphertext, nonce } = encrypt(plaintext, session.conversationKey);

  const encrypted: EncryptedMessage = {
    version: ENCRYPTION_VERSION,
    ciphertext,
    nonce,
  };

  return { encrypted, session };
}

// ==================== Message Decryption ====================

/**
 * Decrypt a message using the conversation key
 *
 * Idempotent — can be called any number of times with the same input.
 * No state mutation, no chain key advancement.
 *
 * @param conversationId - Conversation ID
 * @param remoteUserId - Remote user ID
 * @param encrypted - Encrypted message envelope
 * @returns Decrypted plaintext
 */
export async function decryptWithSession(
  conversationId: string,
  remoteUserId: string,
  encrypted: EncryptedMessage
): Promise<Uint8Array> {
  const session = await getSession(conversationId, remoteUserId);

  if (!session) {
    throw new EncryptionError(
      `No session found for ${conversationId}:${remoteUserId}`,
      'SESSION_NOT_FOUND'
    );
  }

  try {
    return decrypt(encrypted.ciphertext, encrypted.nonce, session.conversationKey);
  } catch (error) {
    throw new EncryptionError(
      'Failed to decrypt message',
      'DECRYPTION_FAILED',
      error as Error
    );
  }
}

// ==================== Session Management ====================

/**
 * Get or create a session (returns null if no session exists)
 */
export async function getOrCreateSession(
  conversationId: string,
  remoteUserId: string
): Promise<ConversationKeySession | null> {
  return getSession(conversationId, remoteUserId);
}

/**
 * Check if a session exists
 */
export async function hasSession(
  conversationId: string,
  remoteUserId: string
): Promise<boolean> {
  const session = await getSession(conversationId, remoteUserId);
  return session !== null;
}

/**
 * Delete a session
 */
export async function removeSession(
  conversationId: string,
  remoteUserId: string
): Promise<void> {
  await deleteSession(conversationId, remoteUserId);
  log.encryption.info(`Session deleted for ${conversationId}:${remoteUserId}`);
}

// Export session service object
export const sessionService = {
  initSessionAsSender,
  initSessionAsRecipient,
  encryptWithSession,
  decryptWithSession,
  getOrCreateSession,
  hasSession,
  removeSession,
};

export default sessionService;
