/**
 * Group Crypto Service
 * Implements static group conversation key encryption (Messenger Labyrinth-style)
 *
 * Pattern (matches Messenger browser behavior):
 * - One shared symmetric group key per conversation
 * - Generated once, distributed to all members
 * - All messages encrypted/decrypted with the same key — stateless and idempotent
 * - Offline users can decrypt any message once they receive the key
 * - Key rotated when group membership changes
 *
 * Storage:
 * - Group key stored in SESSION store with userId = GROUP_KEY_SENTINEL ('GROUP')
 * - Backed up to server per-user via ConversationKeyBackup endpoint
 * - Distributed to members via existing sender-key distribution endpoint (repurposed)
 */

import {
  generateKey,
  encrypt,
  decrypt,
  toHex,
  randomBytes,
} from './cryptoService';
import {
  storeSession,
  getSession,
} from '../db/cryptoDb';
import { KEY_SIZE, GROUP_KEY_SENTINEL } from '../constants';
import type { ConversationKeySession, EncryptedMessage } from '../types';
import { EncryptionError } from '../types';
import { log } from '@/lib/logger';

// Per-group mutex: prevents concurrent generate+store races on first key creation.
const groupKeyLocks = new Map<string, Promise<void>>();

function withGroupKeyLock<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  const prev = groupKeyLocks.get(conversationId) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  groupKeyLocks.set(conversationId, next);
  return prev.then(fn).finally(resolve) as Promise<T>;
}

// ==================== Group Key Management ====================

/**
 * Get the group SESSION entry for a conversation
 */
async function getGroupSession(conversationId: string): Promise<ConversationKeySession | null> {
  return getSession(conversationId, GROUP_KEY_SENTINEL);
}

/**
 * Store a group key as a SESSION entry
 */
async function storeGroupSession(
  conversationId: string,
  conversationKey: Uint8Array,
  groupKeyId: string
): Promise<ConversationKeySession> {
  const now = Date.now();
  const session: ConversationKeySession = {
    conversationKey,
    remoteIdentityKey: new Uint8Array(32), // unused for groups
    createdAt: now,
    updatedAt: now,
    groupKeyId,
  };
  await storeSession(conversationId, GROUP_KEY_SENTINEL, session);
  return session;
}

/**
 * Generate a new random group key and store it
 */
async function generateGroupKey(conversationId: string): Promise<ConversationKeySession> {
  const conversationKey = generateKey(); // 32-byte random key
  const groupKeyId = toHex(randomBytes(16)); // 32-char hex ID

  const session = await storeGroupSession(conversationId, conversationKey, groupKeyId);
  log.encryption.info(`Generated new group key ${groupKeyId} for ${conversationId}`);
  return session;
}

/**
 * Get or create the group key for a conversation.
 * Thread-safe via per-group mutex.
 */
export function getOrCreateGroupKey(conversationId: string): Promise<ConversationKeySession> {
  return withGroupKeyLock(conversationId, async () => {
    const existing = await getGroupSession(conversationId);
    if (existing) return existing;
    return generateGroupKey(conversationId);
  });
}

/**
 * Check if a group key exists locally
 */
export async function hasGroupKey(conversationId: string): Promise<boolean> {
  const session = await getGroupSession(conversationId);
  return session !== null;
}

/**
 * Rotate the group key — generates a new random key.
 * Call when group membership changes (member added/removed).
 */
export async function rotateGroupKey(conversationId: string): Promise<ConversationKeySession> {
  return withGroupKeyLock(conversationId, () => generateGroupKey(conversationId));
}

/**
 * Store a group key received from another member (WS distribution or server fetch).
 * Always overwrites — the latest distributed key is the authoritative one.
 */
export async function storeReceivedGroupKey(
  conversationId: string,
  conversationKey: Uint8Array,
  groupKeyId: string
): Promise<void> {
  await storeGroupSession(conversationId, conversationKey, groupKeyId);
  log.encryption.info(`Stored received group key ${groupKeyId} for ${conversationId}`);
}

// ==================== Message Encryption ====================

/**
 * Encrypt a group message using the shared group key.
 * Stateless and idempotent — no chain advancement.
 *
 * @returns encrypted message envelope with groupKeyId as senderKeyId
 */
export async function encryptGroupMessage(
  conversationId: string,
  plaintext: Uint8Array
): Promise<EncryptedMessage> {
  const session = await getOrCreateGroupKey(conversationId);
  const { ciphertext, nonce } = encrypt(plaintext, session.conversationKey);

  return {
    version: 2,
    ciphertext,
    nonce,
    senderKeyId: session.groupKeyId,
  };
}

/**
 * Decrypt a group message using the shared group key.
 * Fully stateless — can decrypt any message at any time.
 * Offline users who receive the key later can decrypt all historical messages.
 */
export async function decryptGroupMessage(
  conversationId: string,
  encrypted: EncryptedMessage
): Promise<Uint8Array> {
  const session = await getGroupSession(conversationId);

  if (!session) {
    throw new EncryptionError(
      `No group key found for conversation ${conversationId}`,
      'SESSION_NOT_FOUND'
    );
  }

  try {
    return decrypt(encrypted.ciphertext, encrypted.nonce, session.conversationKey);
  } catch (error) {
    throw new EncryptionError(
      'Failed to decrypt group message',
      'DECRYPTION_FAILED',
      error as Error
    );
  }
}

// Export group crypto service object
export const groupCryptoService = {
  getOrCreateGroupKey,
  hasGroupKey,
  rotateGroupKey,
  storeReceivedGroupKey,
  encryptGroupMessage,
  decryptGroupMessage,
};

export default groupCryptoService;
