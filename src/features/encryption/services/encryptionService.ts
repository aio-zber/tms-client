/**
 * Encryption Service
 * High-level API for E2EE message encryption/decryption
 *
 * This service provides:
 * - Unified interface for DM and group encryption
 * - Automatic session management
 * - File encryption support
 * - Key bundle management
 */

import { apiClient } from '@/lib/apiClient';
import {
  initCrypto,
  encrypt,
  decrypt,
  generateKey,
  toBase64,
  fromBase64,
  stringToBytes,
  bytesToString,
} from './cryptoService';
import {
  initializeKeys,
  getPublicKeyBundle,
  x3dhSend,
  x3dhReceive,
  needsPreKeyReplenishment,
  replenishPreKeys,
} from './keyService';
import {
  initSessionAsSender,
  initSessionAsRecipient,
  encryptWithSession,
  decryptWithSession,
  hasSession,
} from './sessionService';
import {
  encryptGroupMessage,
  decryptGroupMessage,
  createSenderKeyDistribution,
  processSenderKeyDistribution,
} from './groupCryptoService';
import { getIdentityKey, hasIdentityKey } from '../db/cryptoDb';
import { useEncryptionStore } from '../stores/keyStore';
import type {
  EncryptedMessage,
  FetchKeyBundleResponse,
  UploadKeyBundleRequest,
  X3DHHeader,
  SenderKeyDistribution,
  EncryptionInitStatus,
} from '../types';
import { EncryptionError } from '../types';
import { log } from '@/lib/logger';

// API base path for encryption endpoints
const ENCRYPTION_API = '/encryption';

// In-memory cache for key bundles
const keyBundleCache = new Map<string, { bundle: FetchKeyBundleResponse; expiresAt: number }>();
const KEY_BUNDLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track sessions that need X3DH header on first message (Viber/Signal pattern)
// Key: "conversationId:userId" → X3DH header to include in first message
const pendingX3DHHeaders = new Map<string, X3DHHeader>();

// Encryption initialization status
let initStatus: EncryptionInitStatus = 'uninitialized';

// ==================== Initialization ====================

/**
 * Initialize the E2EE system
 * Must be called on app startup (after login)
 */
export async function initialize(): Promise<void> {
  if (initStatus === 'ready') return;
  if (initStatus === 'initializing') {
    // Wait for existing initialization
    while (initStatus === 'initializing') {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return;
  }

  initStatus = 'initializing';

  try {
    // Initialize libsodium
    await initCrypto();

    // Check if we have local keys
    const hasLocalKeys = await hasIdentityKey();
    log.encryption.debug(`hasLocalKeys=${hasLocalKeys}`);

    if (!hasLocalKeys) {
      // No local keys — check if server has a backup
      try {
        const { getBackupStatus } = await import('./backupService');
        const status = await getBackupStatus();
        if (status.has_backup) {
          useEncryptionStore.getState().setHasBackup(true);
          initStatus = 'needs_restore';
          useEncryptionStore.getState().setInitStatus('needs_restore');
          log.encryption.info('Backup found — waiting for PIN to restore');
          return;
        }
      } catch (backupErr) {
        // Server unreachable — proceed with new key generation
        log.encryption.warn('Could not check backup status, generating new keys:', backupErr);
      }
    }

    // Initialize or load existing keys
    await initializeKeys();

    // Upload key bundle to server
    await uploadKeyBundle();

    // Check if we need to replenish pre-keys
    if (await needsPreKeyReplenishment()) {
      const newKeys = await replenishPreKeys();
      if (newKeys.length > 0) {
        await uploadPreKeys(newKeys);
      }
    }

    // Check backup status in background
    try {
      const { getBackupStatus } = await import('./backupService');
      const status = await getBackupStatus();
      useEncryptionStore.getState().setHasBackup(status.has_backup);
    } catch (err) {
      log.encryption.warn('Failed to check backup status:', err);
      // Set to false so backup prompt can appear
      useEncryptionStore.getState().setHasBackup(false);
    }

    initStatus = 'ready';
    useEncryptionStore.getState().setInitStatus('ready');
    log.encryption.info('E2EE initialized successfully');
  } catch (error) {
    initStatus = 'error';
    useEncryptionStore.getState().setInitStatus('error', (error as Error).message);
    log.encryption.error('E2EE initialization failed:', error);
    throw new EncryptionError(
      'Failed to initialize encryption',
      'INIT_FAILED',
      error as Error
    );
  }
}

/**
 * Check if E2EE is initialized
 */
export function isInitialized(): boolean {
  return initStatus === 'ready';
}

/**
 * Get initialization status
 */
export function getInitStatus(): EncryptionInitStatus {
  return initStatus;
}

// ==================== Key Bundle API ====================

/**
 * Upload our key bundle to the server
 */
async function uploadKeyBundle(): Promise<void> {
  const bundle = await getPublicKeyBundle();

  const request: UploadKeyBundleRequest = {
    identity_key: toBase64(bundle.identityKey),
    signed_prekey: {
      key_id: bundle.signedPreKey.keyId,
      public_key: toBase64(bundle.signedPreKey.publicKey),
      signature: toBase64(bundle.signedPreKey.signature),
    },
    one_time_prekeys: bundle.oneTimePreKeys.map((pk) => ({
      key_id: pk.keyId,
      public_key: toBase64(pk.publicKey),
    })),
  };

  try {
    await apiClient.post(`${ENCRYPTION_API}/keys/bundle`, request);
    log.encryption.info('Key bundle uploaded to server');
  } catch (err) {
    log.encryption.error('Key bundle upload failed:', err);
    throw err;
  }
}

/**
 * Upload additional pre-keys to server
 */
async function uploadPreKeys(
  preKeys: Array<{ keyId: number; keyPair: { publicKey: Uint8Array } }>
): Promise<void> {
  const request = {
    prekeys: preKeys.map((pk) => ({
      key_id: pk.keyId,
      public_key: toBase64(pk.keyPair.publicKey),
    })),
  };

  await apiClient.post(`${ENCRYPTION_API}/keys/prekeys`, request);
  log.encryption.info(`Uploaded ${preKeys.length} pre-keys to server`);
}

/**
 * Fetch a user's key bundle from server
 */
async function fetchKeyBundle(userId: string): Promise<FetchKeyBundleResponse> {
  // Check cache first
  const cached = keyBundleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.bundle;
  }

  const bundle = await apiClient.get<FetchKeyBundleResponse>(
    `${ENCRYPTION_API}/keys/bundle/${userId}`
  );

  // Cache the bundle
  keyBundleCache.set(userId, {
    bundle,
    expiresAt: Date.now() + KEY_BUNDLE_CACHE_TTL,
  });

  // Check if identity key changed (in background)
  try {
    const { checkIdentityKey } = await import('./verificationService');
    const verifyStatus = await checkIdentityKey(userId, bundle.identity_key);
    if (verifyStatus === 'key_changed') {
      useEncryptionStore.getState().setIdentityKeyChanged(userId, true);
    }
  } catch {
    // Non-critical — don't block session establishment
  }

  return bundle;
}

// ==================== Session Establishment ====================

/**
 * Establish a session with a user for encrypted communication
 * Returns X3DH header to include in first message (Viber/Signal pattern)
 *
 * @param conversationId - Conversation ID
 * @param userId - Remote user ID
 * @returns X3DH header for first message, or undefined if session already exists
 */
export async function establishSession(
  conversationId: string,
  userId: string
): Promise<X3DHHeader | undefined> {
  if (!isInitialized()) {
    await initialize();
  }

  // Check if session already exists
  if (await hasSession(conversationId, userId)) {
    log.encryption.debug(`Session already exists for ${conversationId}:${userId}`);
    return undefined;
  }

  // Fetch their key bundle
  const theirBundle = await fetchKeyBundle(userId);

  // Get our identity key
  const ourKeys = await getIdentityKey();
  if (!ourKeys) {
    throw new EncryptionError('Local keys not found', 'KEY_GENERATION_FAILED');
  }

  // Perform X3DH key agreement
  const { sharedSecret, header: x3dhHeader } = x3dhSend(ourKeys.identityKeyPair, {
    identityKey: fromBase64(theirBundle.identity_key),
    signedPreKey: {
      keyId: theirBundle.signed_prekey.key_id,
      publicKey: fromBase64(theirBundle.signed_prekey.public_key),
      signature: fromBase64(theirBundle.signed_prekey.signature),
    },
    oneTimePreKey: theirBundle.one_time_prekey
      ? {
          keyId: theirBundle.one_time_prekey.key_id,
          publicKey: fromBase64(theirBundle.one_time_prekey.public_key),
        }
      : undefined,
  });

  // Derive conversation key from X3DH shared secret
  await initSessionAsSender(
    conversationId,
    userId,
    sharedSecret,
    fromBase64(theirBundle.identity_key)
  );

  // Store header for first message (consumed after use)
  const sessionKey = `${conversationId}:${userId}`;
  pendingX3DHHeaders.set(sessionKey, x3dhHeader);

  log.encryption.info(`Session established with ${userId} for ${conversationId}`);

  return x3dhHeader;
}

// In-flight X3DH processing — prevents concurrent processX3DHHeader from
// consuming the one-time pre-key twice and creating sessions with different secrets.
const processingX3DH = new Map<string, Promise<void>>();

/**
 * Process an incoming X3DH header and establish session as recipient.
 * Deduplicated per conversation:sender — only the first call runs X3DH;
 * concurrent calls wait for it and then return.
 */
export async function processX3DHHeader(
  conversationId: string,
  senderId: string,
  header: X3DHHeader
): Promise<void> {
  if (!isInitialized()) {
    await initialize();
  }

  // Check if session already exists
  if (await hasSession(conversationId, senderId)) {
    return;
  }

  const key = `${conversationId}:${senderId}`;

  // If another call is already processing X3DH for this session, wait for it
  const existing = processingX3DH.get(key);
  if (existing) {
    await existing;
    return;
  }

  // This is the first call — run X3DH and let concurrent calls wait
  const promise = (async () => {
    try {
      // Double-check after acquiring the "slot" (another call may have finished before us)
      if (await hasSession(conversationId, senderId)) {
        return;
      }

      // Get our keys
      const ourKeys = await getIdentityKey();
      if (!ourKeys) {
        throw new EncryptionError('Local keys not found', 'KEY_GENERATION_FAILED');
      }

      // Perform X3DH as recipient
      const sharedSecret = await x3dhReceive(
        header,
        ourKeys.identityKeyPair,
        ourKeys.signedPreKey,
        header.preKeyId
      );

      // Derive conversation key from X3DH shared secret
      await initSessionAsRecipient(
        conversationId,
        senderId,
        sharedSecret,
        header.identityKey
      );

      log.encryption.info(`Session established as recipient with ${senderId} for ${conversationId}`);
    } finally {
      processingX3DH.delete(key);
    }
  })();

  processingX3DH.set(key, promise);
  await promise;
}

// ==================== Message Encryption ====================

/**
 * Encrypt a text message for a 1:1 conversation
 *
 * Viber/Signal pattern:
 * - On first message, includes X3DH header for recipient to establish session
 * - Subsequent messages only include Double Ratchet encrypted content
 *
 * @param conversationId - Conversation ID
 * @param recipientId - Recipient's user ID
 * @param content - Message content
 */
export async function encryptDirectMessage(
  conversationId: string,
  recipientId: string,
  content: string
): Promise<{ encryptedContent: string; header?: X3DHHeader }> {
  if (!isInitialized()) {
    await initialize();
  }

  // Check for pending X3DH header (first message after session creation)
  const sessionKey = `${conversationId}:${recipientId}`;
  let header = pendingX3DHHeaders.get(sessionKey);

  // Ensure session exists
  const sessionExists = await hasSession(conversationId, recipientId);

  if (!sessionExists) {
    // Establish session - returns X3DH header for first message
    header = await establishSession(conversationId, recipientId);
  }

  // Encrypt message
  const plaintext = stringToBytes(content);
  const { encrypted } = await encryptWithSession(conversationId, recipientId, plaintext);

  // Serialize encrypted message
  const encryptedContent = serializeEncryptedMessage(encrypted);

  // Consume the pending header after first message (one-time use)
  if (header) {
    pendingX3DHHeaders.delete(sessionKey);
    log.encryption.debug(`X3DH header included for first message to ${recipientId}`);
  }

  return { encryptedContent, header };
}

/**
 * Decrypt a text message from a 1:1 conversation
 *
 * @param conversationId - Conversation ID
 * @param senderId - Sender's user ID
 * @param encryptedContent - Encrypted message content
 * @param header - X3DH header (for first message)
 */
export async function decryptDirectMessage(
  conversationId: string,
  senderId: string,
  encryptedContent: string,
  header?: X3DHHeader
): Promise<string> {
  if (!isInitialized()) {
    await initialize();
  }

  // Process X3DH header if present (first message)
  if (header) {
    await processX3DHHeader(conversationId, senderId, header);
  }

  // Deserialize encrypted message
  const encrypted = deserializeEncryptedMessage(encryptedContent);

  // Decrypt message
  const plaintext = await decryptWithSession(conversationId, senderId, encrypted);

  return bytesToString(plaintext);
}

/**
 * Encrypt a message for a group conversation
 *
 * @param conversationId - Group conversation ID
 * @param userId - Our user ID
 * @param content - Message content
 */
export async function encryptGroupMessageContent(
  conversationId: string,
  userId: string,
  content: string
): Promise<string> {
  if (!isInitialized()) {
    await initialize();
  }

  const plaintext = stringToBytes(content);
  const encrypted = await encryptGroupMessage(conversationId, userId, plaintext);

  return serializeEncryptedMessage(encrypted);
}

/**
 * Decrypt a message from a group conversation
 *
 * @param conversationId - Group conversation ID
 * @param senderId - Sender's user ID
 * @param encryptedContent - Encrypted message content
 */
export async function decryptGroupMessageContent(
  conversationId: string,
  senderId: string,
  encryptedContent: string
): Promise<string> {
  if (!isInitialized()) {
    await initialize();
  }

  const encrypted = deserializeEncryptedMessage(encryptedContent);
  const plaintext = await decryptGroupMessage(conversationId, senderId, encrypted);

  return bytesToString(plaintext);
}

// ==================== File Encryption ====================

/**
 * Encrypt a file before upload
 *
 * @param file - File to encrypt
 */
export async function encryptFile(file: File): Promise<{
  encryptedBlob: Blob;
  fileKey: Uint8Array;
  nonce: Uint8Array;
  metadata: { originalSize: number; mimeType: string; fileName: string };
}> {
  if (!isInitialized()) {
    await initialize();
  }

  // Generate random file key
  const fileKey = generateKey();

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const plaintext = new Uint8Array(arrayBuffer);

  // Encrypt file content
  const { ciphertext, nonce } = encrypt(plaintext, fileKey);

  // Create encrypted blob (convert to regular ArrayBuffer for Blob compatibility)
  const encryptedBlob = new Blob([new Uint8Array(ciphertext)], { type: 'application/octet-stream' });

  return {
    encryptedBlob,
    fileKey,
    nonce,
    metadata: {
      originalSize: file.size,
      mimeType: file.type,
      fileName: file.name,
    },
  };
}

/**
 * Decrypt a downloaded file
 *
 * @param encryptedData - Encrypted file data
 * @param fileKey - Decryption key
 * @param nonce - Nonce used for encryption
 * @param mimeType - Original MIME type
 */
export async function decryptFile(
  encryptedData: ArrayBuffer,
  fileKey: Uint8Array,
  nonce: Uint8Array,
  mimeType: string
): Promise<Blob> {
  if (!isInitialized()) {
    await initialize();
  }

  const ciphertext = new Uint8Array(encryptedData);
  const plaintext = decrypt(ciphertext, nonce, fileKey);

  // Convert to regular ArrayBuffer for Blob compatibility
  return new Blob([new Uint8Array(plaintext)], { type: mimeType });
}

// ==================== Sender Key Distribution ====================

/**
 * Distribute sender key to group members
 * Should be called when joining a group or when sender key is rotated
 */
export async function distributeSenderKey(
  conversationId: string,
  userId: string,
  memberIds: string[]
): Promise<void> {
  // Create sender key distribution
  const distribution = await createSenderKeyDistribution(conversationId, userId);

  // Send distribution to each member via server
  // The server will relay this to each member
  await apiClient.post(`${ENCRYPTION_API}/sender-keys/distribute`, {
    conversation_id: conversationId,
    recipients: memberIds,
    distribution: {
      key_id: distribution.keyId,
      chain_key: toBase64(distribution.chainKey),
      public_signing_key: toBase64(distribution.publicSigningKey),
    },
  });

  log.encryption.info(`Distributed sender key to ${memberIds.length} members`);
}

/**
 * Process received sender key distribution
 */
export async function receiveSenderKeyDistribution(
  data: {
    conversation_id: string;
    sender_id: string;
    key_id: string;
    chain_key: string;
    public_signing_key: string;
  }
): Promise<void> {
  const distribution: SenderKeyDistribution = {
    conversationId: data.conversation_id,
    senderId: data.sender_id,
    keyId: data.key_id,
    chainKey: fromBase64(data.chain_key),
    publicSigningKey: fromBase64(data.public_signing_key),
  };

  await processSenderKeyDistribution(distribution);
}

// ==================== Serialization ====================

/**
 * Serialize encrypted message for transmission
 * v2 messages omit messageNumber and previousChainLength (no Double Ratchet)
 */
function serializeEncryptedMessage(encrypted: EncryptedMessage): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serialized: Record<string, any> = {
    v: encrypted.version,
    c: toBase64(encrypted.ciphertext),
    n: toBase64(encrypted.nonce),
  };

  // Only include Double Ratchet fields for legacy v1 messages
  if (encrypted.version === 1) {
    serialized.mn = encrypted.messageNumber;
    serialized.pcl = encrypted.previousChainLength;
  }

  if (encrypted.senderKeyId) {
    serialized.ski = encrypted.senderKeyId;
  }

  return JSON.stringify(serialized);
}

/**
 * Deserialize encrypted message from transmission
 * Handles both v1 (legacy Double Ratchet) and v2 (conversation key) formats
 */
function deserializeEncryptedMessage(data: string): EncryptedMessage {
  const parsed = JSON.parse(data);

  return {
    version: parsed.v,
    ciphertext: fromBase64(parsed.c),
    nonce: fromBase64(parsed.n),
    messageNumber: parsed.mn,
    previousChainLength: parsed.pcl,
    senderKeyId: parsed.ski,
  };
}

/**
 * Serialize X3DH header for transmission
 */
export function serializeX3DHHeader(header: X3DHHeader): string {
  return JSON.stringify({
    ik: toBase64(header.identityKey),
    ek: toBase64(header.ephemeralKey),
    spkId: header.signedPreKeyId,
    opkId: header.preKeyId,
  });
}

/**
 * Deserialize X3DH header from transmission
 */
export function deserializeX3DHHeader(data: string): X3DHHeader {
  const parsed = JSON.parse(data);

  return {
    identityKey: fromBase64(parsed.ik),
    ephemeralKey: fromBase64(parsed.ek),
    signedPreKeyId: parsed.spkId,
    preKeyId: parsed.opkId,
  };
}

// ==================== Cleanup ====================

/**
 * Clear all encryption data (for logout)
 */
export async function clearEncryptionData(): Promise<void> {
  const { clearAllData } = await import('../db/cryptoDb');
  await clearAllData();
  keyBundleCache.clear();
  pendingX3DHHeaders.clear();
  processingX3DH.clear();
  initStatus = 'uninitialized';
  log.encryption.info('Encryption data cleared');
}

// Export encryption service object
export const encryptionService = {
  initialize,
  isInitialized,
  getInitStatus,
  establishSession,
  encryptDirectMessage,
  decryptDirectMessage,
  encryptGroupMessageContent,
  decryptGroupMessageContent,
  encryptFile,
  decryptFile,
  distributeSenderKey,
  receiveSenderKeyDistribution,
  serializeX3DHHeader,
  deserializeX3DHHeader,
  clearEncryptionData,
};

export default encryptionService;
