/**
 * Session Service
 * Implements the Double Ratchet Algorithm for forward secrecy
 *
 * The Double Ratchet provides:
 * - Forward secrecy: Past messages can't be decrypted if keys are compromised
 * - Post-compromise security: Future messages protected after key compromise
 * - Out-of-order message handling: Messages can be received in any order
 *
 * Ratchets:
 * - DH Ratchet: Updates root key when receiving new DH public key
 * - Symmetric Ratchet: Derives per-message keys from chain key
 */

import {
  generateX25519KeyPair,
  x25519,
  deriveKey,
  encrypt,
  decrypt,
  toHex,
} from './cryptoService';
import {
  storeSession,
  getSession,
  deleteSession,
  storeMessageKey,
  consumeMessageKey,
} from '../db/cryptoDb';
import { MAX_SKIP, KEY_SIZE } from '../constants';
import type {
  KeyPair,
  SessionState,
  EncryptedMessage,
} from '../types';
import { EncryptionError } from '../types';
import { log } from '@/lib/logger';

// KDF info strings for domain separation
const KDF_ROOT = 'TMA-DoubleRatchet-Root';
const KDF_CHAIN = 'TMA-DoubleRatchet-Chain';
const KDF_MESSAGE = 'TMA-DoubleRatchet-Message';

// ==================== Session Initialization ====================

/**
 * Initialize a new session as sender (after X3DH)
 *
 * @param conversationId - Conversation ID
 * @param remoteUserId - Remote user ID
 * @param sharedSecret - Shared secret from X3DH
 * @param remoteIdentityKey - Remote party's identity key
 * @param remotePublicKey - Remote party's current ratchet public key (usually signed pre-key)
 */
export async function initSessionAsSender(
  conversationId: string,
  remoteUserId: string,
  sharedSecret: Uint8Array,
  remoteIdentityKey: Uint8Array,
  remotePublicKey: Uint8Array
): Promise<SessionState> {
  // Generate our first ratchet key pair
  const localKeyPair = generateX25519KeyPair();

  // Perform initial DH ratchet step
  const dhOutput = x25519(localKeyPair.privateKey, remotePublicKey);

  // Derive root key and sending chain key
  const { rootKey, chainKey } = kdfRootKey(sharedSecret, dhOutput);

  const now = Date.now();
  const state: SessionState = {
    remoteIdentityKey,
    remotePublicKey,
    localKeyPair,
    rootKey,
    sendingChainKey: { key: chainKey, index: 0 },
    receivingChainKey: { key: new Uint8Array(KEY_SIZE), index: 0 }, // Not set until we receive
    previousSendingChains: [],
    skippedMessageKeys: new Map(),
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousSendingChainLength: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Store session
  await storeSession(conversationId, remoteUserId, state);

  log.encryption.info(`Session initialized as sender for ${conversationId}:${remoteUserId}`);

  return state;
}

/**
 * Initialize a new session as recipient (after X3DH)
 *
 * @param conversationId - Conversation ID
 * @param remoteUserId - Remote user ID
 * @param sharedSecret - Shared secret from X3DH
 * @param remoteIdentityKey - Remote party's identity key
 * @param header - X3DH header from sender
 * @param ourSignedPreKey - Our signed pre-key used in X3DH
 */
export async function initSessionAsRecipient(
  conversationId: string,
  remoteUserId: string,
  sharedSecret: Uint8Array,
  remoteIdentityKey: Uint8Array,
  senderEphemeralKey: Uint8Array,
  ourSignedPreKey: KeyPair
): Promise<SessionState> {
  const now = Date.now();

  // We don't have a local ratchet key pair yet
  // It will be created when we send our first message
  const state: SessionState = {
    remoteIdentityKey,
    remotePublicKey: senderEphemeralKey,
    localKeyPair: ourSignedPreKey, // Use signed pre-key initially
    rootKey: sharedSecret,
    sendingChainKey: { key: new Uint8Array(KEY_SIZE), index: 0 }, // Not set until we ratchet
    receivingChainKey: { key: new Uint8Array(KEY_SIZE), index: 0 }, // Will be set on first decrypt
    previousSendingChains: [],
    skippedMessageKeys: new Map(),
    sendingMessageNumber: 0,
    receivingMessageNumber: 0,
    previousSendingChainLength: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Perform DH ratchet to derive receiving chain
  const dhOutput = x25519(ourSignedPreKey.privateKey, senderEphemeralKey);
  const { rootKey, chainKey } = kdfRootKey(sharedSecret, dhOutput);

  state.rootKey = rootKey;
  state.receivingChainKey = { key: chainKey, index: 0 };

  // Store session
  await storeSession(conversationId, remoteUserId, state);

  log.encryption.info(`Session initialized as recipient for ${conversationId}:${remoteUserId}`);

  return state;
}

// ==================== Message Encryption ====================

/**
 * Encrypt a message using the Double Ratchet
 *
 * @param conversationId - Conversation ID
 * @param remoteUserId - Remote user ID
 * @param plaintext - Message to encrypt
 * @returns Encrypted message with header
 */
export async function encryptWithSession(
  conversationId: string,
  remoteUserId: string,
  plaintext: Uint8Array
): Promise<{ encrypted: EncryptedMessage; state: SessionState }> {
  const state = await getSession(conversationId, remoteUserId);

  if (!state) {
    throw new EncryptionError(
      `No session found for ${conversationId}:${remoteUserId}`,
      'SESSION_NOT_FOUND'
    );
  }

  // Derive message key from sending chain
  const { messageKey, nextChainKey } = kdfChainKey(state.sendingChainKey.key);

  // Update chain key
  state.sendingChainKey = {
    key: nextChainKey,
    index: state.sendingChainKey.index + 1,
  };
  state.sendingMessageNumber++;

  // Encrypt message
  const { ciphertext, nonce } = encrypt(plaintext, messageKey);

  const encrypted: EncryptedMessage = {
    version: 1,
    ciphertext,
    nonce,
    messageNumber: state.sendingMessageNumber - 1,
    previousChainLength: state.previousSendingChainLength,
  };

  // Update session state
  state.updatedAt = Date.now();
  await storeSession(conversationId, remoteUserId, state);

  return { encrypted, state };
}

/**
 * Encrypt a message with DH ratchet step (new key pair)
 * Used when initiating a new sending chain
 */
export async function encryptWithRatchet(
  conversationId: string,
  remoteUserId: string,
  plaintext: Uint8Array
): Promise<{ encrypted: EncryptedMessage; state: SessionState; newPublicKey: Uint8Array }> {
  const state = await getSession(conversationId, remoteUserId);

  if (!state) {
    throw new EncryptionError(
      `No session found for ${conversationId}:${remoteUserId}`,
      'SESSION_NOT_FOUND'
    );
  }

  // Save current sending chain
  if (state.sendingChainKey.index > 0) {
    state.previousSendingChains.push({
      publicKey: state.localKeyPair.publicKey,
      chainKey: state.sendingChainKey,
      messageKeys: new Map(),
    });
    state.previousSendingChainLength = state.sendingChainKey.index;
  }

  // Generate new ratchet key pair
  const newKeyPair = generateX25519KeyPair();

  // Perform DH ratchet
  const dhOutput = x25519(newKeyPair.privateKey, state.remotePublicKey);
  const { rootKey, chainKey } = kdfRootKey(state.rootKey, dhOutput);

  // Update state
  state.localKeyPair = newKeyPair;
  state.rootKey = rootKey;
  state.sendingChainKey = { key: chainKey, index: 0 };
  state.sendingMessageNumber = 0;

  // Now encrypt with the new chain
  const result = await encryptWithSession(conversationId, remoteUserId, plaintext);

  return {
    ...result,
    newPublicKey: newKeyPair.publicKey,
  };
}

// ==================== Message Decryption ====================

/**
 * Decrypt a message using the Double Ratchet
 *
 * @param conversationId - Conversation ID
 * @param remoteUserId - Remote user ID
 * @param encrypted - Encrypted message
 * @param senderPublicKey - Sender's current ratchet public key (optional, for DH ratchet)
 */
export async function decryptWithSession(
  conversationId: string,
  remoteUserId: string,
  encrypted: EncryptedMessage,
  senderPublicKey?: Uint8Array
): Promise<Uint8Array> {
  let state = await getSession(conversationId, remoteUserId);

  if (!state) {
    throw new EncryptionError(
      `No session found for ${conversationId}:${remoteUserId}`,
      'SESSION_NOT_FOUND'
    );
  }

  const messageNumber = encrypted.messageNumber ?? 0;
  const previousChainLength = encrypted.previousChainLength ?? 0;

  // Check if this is a message from a previous chain (skipped message)
  const skippedKey = await tryGetSkippedMessageKey(
    conversationId,
    remoteUserId,
    senderPublicKey || state.remotePublicKey,
    messageNumber
  );

  if (skippedKey) {
    return decrypt(encrypted.ciphertext, encrypted.nonce, skippedKey);
  }

  // Check if we need to perform a DH ratchet step
  if (senderPublicKey && !keysEqual(senderPublicKey, state.remotePublicKey)) {
    state = await performDHRatchet(
      conversationId,
      remoteUserId,
      state,
      senderPublicKey,
      previousChainLength
    );
  }

  // Skip ahead in the receiving chain if needed
  if (messageNumber > state.receivingChainKey.index) {
    state = await skipMessageKeys(
      conversationId,
      remoteUserId,
      state,
      messageNumber
    );
  }

  // Derive message key
  const { messageKey, nextChainKey } = kdfChainKey(state.receivingChainKey.key);

  // Update chain key
  state.receivingChainKey = {
    key: nextChainKey,
    index: state.receivingChainKey.index + 1,
  };
  state.receivingMessageNumber++;

  // Decrypt message
  try {
    const plaintext = decrypt(encrypted.ciphertext, encrypted.nonce, messageKey);

    // Update session state
    state.updatedAt = Date.now();
    await storeSession(conversationId, remoteUserId, state);

    return plaintext;
  } catch (error) {
    throw new EncryptionError(
      'Failed to decrypt message',
      'DECRYPTION_FAILED',
      error as Error
    );
  }
}

/**
 * Perform DH ratchet step when receiving a new public key
 */
async function performDHRatchet(
  conversationId: string,
  remoteUserId: string,
  state: SessionState,
  newRemotePublicKey: Uint8Array,
  previousChainLength: number
): Promise<SessionState> {
  // Skip any remaining messages in the current receiving chain
  if (previousChainLength > state.receivingChainKey.index) {
    state = await skipMessageKeys(
      conversationId,
      remoteUserId,
      state,
      previousChainLength
    );
  }

  // Update remote public key
  state.remotePublicKey = newRemotePublicKey;

  // Perform DH to derive new receiving chain
  const dhOutput = x25519(state.localKeyPair.privateKey, newRemotePublicKey);
  const { rootKey, chainKey } = kdfRootKey(state.rootKey, dhOutput);

  state.rootKey = rootKey;
  state.receivingChainKey = { key: chainKey, index: 0 };
  state.receivingMessageNumber = 0;

  // Generate new ratchet key pair for next sending
  state.localKeyPair = generateX25519KeyPair();

  // Perform DH to derive new sending chain
  const dhOutput2 = x25519(state.localKeyPair.privateKey, newRemotePublicKey);
  const { rootKey: rootKey2, chainKey: chainKey2 } = kdfRootKey(state.rootKey, dhOutput2);

  state.rootKey = rootKey2;
  state.sendingChainKey = { key: chainKey2, index: 0 };
  state.sendingMessageNumber = 0;

  return state;
}

/**
 * Skip message keys and store them for out-of-order messages
 */
async function skipMessageKeys(
  conversationId: string,
  remoteUserId: string,
  state: SessionState,
  untilIndex: number
): Promise<SessionState> {
  if (untilIndex - state.receivingChainKey.index > MAX_SKIP) {
    throw new EncryptionError(
      `Too many skipped messages: ${untilIndex - state.receivingChainKey.index}`,
      'MESSAGE_TOO_OLD'
    );
  }

  const sessionId = `${conversationId}:${remoteUserId}`;
  const publicKeyHex = toHex(state.remotePublicKey);

  while (state.receivingChainKey.index < untilIndex) {
    const { messageKey, nextChainKey } = kdfChainKey(state.receivingChainKey.key);

    // Store skipped key
    await storeMessageKey(
      sessionId,
      publicKeyHex,
      state.receivingChainKey.index,
      messageKey
    );

    state.receivingChainKey = {
      key: nextChainKey,
      index: state.receivingChainKey.index + 1,
    };
  }

  return state;
}

/**
 * Try to get a skipped message key
 */
async function tryGetSkippedMessageKey(
  conversationId: string,
  remoteUserId: string,
  senderPublicKey: Uint8Array,
  messageIndex: number
): Promise<Uint8Array | null> {
  const sessionId = `${conversationId}:${remoteUserId}`;
  const publicKeyHex = toHex(senderPublicKey);

  return consumeMessageKey(sessionId, publicKeyHex, messageIndex);
}

// ==================== Key Derivation Functions ====================

/**
 * KDF for root key ratchet
 * Derives new root key and chain key from DH output
 */
function kdfRootKey(
  rootKey: Uint8Array,
  dhOutput: Uint8Array
): { rootKey: Uint8Array; chainKey: Uint8Array } {
  // Concatenate root key and DH output
  const input = new Uint8Array(rootKey.length + dhOutput.length);
  input.set(rootKey, 0);
  input.set(dhOutput, rootKey.length);

  // Derive 64 bytes: 32 for new root key, 32 for chain key
  const derived = deriveKey(input, KDF_ROOT, 64);

  return {
    rootKey: derived.slice(0, 32),
    chainKey: derived.slice(32, 64),
  };
}

/**
 * KDF for chain key ratchet
 * Derives message key and next chain key
 */
function kdfChainKey(
  chainKey: Uint8Array
): { messageKey: Uint8Array; nextChainKey: Uint8Array } {
  // Derive message key
  const messageKey = deriveKey(chainKey, KDF_MESSAGE, KEY_SIZE);

  // Derive next chain key
  const nextChainKey = deriveKey(chainKey, KDF_CHAIN, KEY_SIZE);

  return { messageKey, nextChainKey };
}

// ==================== Utilities ====================

/**
 * Check if two keys are equal
 */
function keysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Get or create a session
 */
export async function getOrCreateSession(
  conversationId: string,
  remoteUserId: string
): Promise<SessionState | null> {
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
  encryptWithRatchet,
  decryptWithSession,
  getOrCreateSession,
  hasSession,
  removeSession,
};

export default sessionService;
