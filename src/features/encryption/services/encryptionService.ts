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
  toHex,
  randomBytes,
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
  removeSession,
} from './sessionService';
import {
  encryptGroupMessage,
  decryptGroupMessage,
  getOrCreateGroupKey,
  hasGroupKey,
  storeReceivedGroupKey,
} from './groupCryptoService';
import { getIdentityKey, hasIdentityKey } from '../db/cryptoDb';
import { useEncryptionStore } from '../stores/keyStore';
import { GROUP_KEY_SENTINEL } from '../constants';
import type {
  EncryptedMessage,
  FetchKeyBundleResponse,
  UploadKeyBundleRequest,
  X3DHHeader,
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

// Per-conversation group key recovery deduplication.
// Maps conversationId → in-flight recovery Promise (or resolved true/false).
// Ensures tryRecoverGroupKey is called at most once per conversation per session,
// regardless of how many messages fail concurrently.
const groupKeyRecoveryCache = new Map<string, Promise<boolean>>();

// Per-conversation distribution tracking.
// Once we've successfully distributed our group key for a conversation this session,
// skip redundant POST /distribute + POST /keys/conversation calls on re-visits.
// Messenger pattern: distribute once per session, reuse cached state thereafter.
const distributedGroupKeys = new Set<string>();

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

    // Upload existing session key backups in background (for sessions pre-dating this feature)
    uploadAllExistingSessionBackups();

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

  // Upload conversation key backup for multi-device recovery (fire-and-forget)
  uploadConversationKeyBackup(conversationId, userId);

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

      // Upload conversation key backup for multi-device recovery (fire-and-forget)
      uploadConversationKeyBackup(conversationId, senderId);

      log.encryption.info(`Session established as recipient with ${senderId} for ${conversationId}`);
    } finally {
      processingX3DH.delete(key);
    }
  })();

  processingX3DH.set(key, promise);
  await promise;
}

// ==================== Session Recovery ====================

/**
 * Upload the conversation key to the server, encrypted with our own identity key.
 * Enables multi-device recovery without needing the X3DH one-time prekey.
 * Fire-and-forget — failures are non-critical (X3DH recovery is the fallback).
 */
async function uploadConversationKeyBackup(
  conversationId: string,
  remoteUserId: string
): Promise<void> {
  try {
    const session = await import('../db/cryptoDb').then(({ getSession }) =>
      getSession(conversationId, remoteUserId)
    );
    if (!session) return;

    const ourKeys = await getIdentityKey();
    if (!ourKeys) return;

    // Pack conversationKey + remoteIdentityKey into a single payload before encrypting
    // Format: 32 bytes conversationKey || 32 bytes remoteIdentityKey = 64 bytes total
    const payload = new Uint8Array(64);
    payload.set(session.conversationKey, 0);
    payload.set(session.remoteIdentityKey.slice(0, 32), 32);

    // Encrypt with our own identity private key (32-byte X25519)
    const { ciphertext, nonce } = encrypt(payload, ourKeys.identityKeyPair.privateKey);

    await apiClient.post(`${ENCRYPTION_API}/keys/conversation`, {
      conversation_id: conversationId,
      encrypted_key: toBase64(ciphertext),
      nonce: toBase64(nonce),
    });

    log.encryption.debug(`Conversation key backup uploaded for ${conversationId}`);
  } catch (err) {
    // Non-critical — X3DH recovery remains as fallback
    log.encryption.warn(`Conversation key backup upload failed for ${conversationId}:`, err);
  }
}

/**
 * Upload key backups for all existing sessions (fire-and-forget).
 * Called once on init to ensure sessions established before this feature are covered.
 * Handles both DM sessions and GROUP sessions (stored under GROUP_KEY_SENTINEL).
 */
async function uploadAllExistingSessionBackups(): Promise<void> {
  try {
    const { getAllSessions } = await import('../db/cryptoDb');
    const sessions = await getAllSessions();
    if (sessions.length === 0) return;

    const ourKeys = await getIdentityKey();
    if (!ourKeys) return;

    for (const { conversationId, userId, session } of sessions) {
      try {
        const isGroup = userId === GROUP_KEY_SENTINEL;

        const payload = new Uint8Array(64);
        payload.set(session.conversationKey, 0);
        if (!isGroup) {
          // DM: include remote identity key for identity verification
          payload.set(session.remoteIdentityKey.slice(0, 32), 32);
        }
        // Group: remoteIdentityKey slot stays as zeros

        const { ciphertext, nonce } = encrypt(payload, ourKeys.identityKeyPair.privateKey);

        await apiClient.post(`${ENCRYPTION_API}/keys/conversation`, {
          conversation_id: conversationId,
          encrypted_key: toBase64(ciphertext),
          nonce: toBase64(nonce),
        });
      } catch {
        // Skip failed uploads — non-critical
      }
    }

    log.encryption.info(`Uploaded key backups for ${sessions.length} existing sessions`);
  } catch (err) {
    log.encryption.warn('Failed to upload existing session backups:', err);
  }
}

/**
 * Try to recover a session from the server-stored conversation key backup.
 * Uses our own identity private key to decrypt (Messenger multi-device pattern).
 *
 * @returns true if session was successfully restored
 */
async function tryRecoverFromKeyBackup(
  conversationId: string,
  remoteUserId: string
): Promise<boolean> {
  try {
    const response = await apiClient.get<{
      conversation_id: string;
      encrypted_key: string;
      nonce: string;
    }>(`${ENCRYPTION_API}/keys/conversation/${conversationId}`);

    const ourKeys = await getIdentityKey();
    if (!ourKeys) return false;

    const ciphertext = fromBase64(response.encrypted_key);
    const nonce = fromBase64(response.nonce);

    // Decrypt using our identity private key
    const payload = decrypt(ciphertext, nonce, ourKeys.identityKeyPair.privateKey);

    // Unpack: first 32 bytes = conversationKey, next 32 bytes = remoteIdentityKey
    const conversationKey = payload.slice(0, 32);
    const remoteIdentityKey = payload.slice(32, 64);

    // Store the recovered session
    const { storeSession } = await import('../db/cryptoDb');
    await storeSession(conversationId, remoteUserId, {
      conversationKey,
      remoteIdentityKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    log.encryption.info(`Session recovered from key backup for ${conversationId}:${remoteUserId}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to recover a session by fetching the X3DH header from the first
 * encrypted message in the conversation (Messenger-style on-demand key derivation).
 *
 * @returns true if session was successfully re-established
 */
async function tryRecoverSession(
  conversationId: string,
  senderId: string,
  _currentContent?: string
): Promise<boolean> {
  // Strategy 1: Try key backup first (works across devices without needing OPK)
  const recoveredFromBackup = await tryRecoverFromKeyBackup(conversationId, senderId);
  if (recoveredFromBackup) return true;

  // Strategy 2: Re-run X3DH from stored header (works if OPK is still in IndexedDB)
  try {
    const response = await apiClient.get<{
      found: boolean;
      x3dh_header: string | null;
      sender_id: string | null;
    }>(`/messages/conversations/${conversationId}/x3dh-header`);

    if (!response.found || !response.x3dh_header || !response.sender_id) {
      log.encryption.warn(`No X3DH header found for session recovery in ${conversationId}`);
      return false;
    }

    // Deserialize and process the header to re-establish the session
    const header = deserializeX3DHHeader(response.x3dh_header);
    await processX3DHHeader(conversationId, response.sender_id, header);

    log.encryption.info(`Session recovered from X3DH header for ${conversationId}:${senderId}`);
    return true;
  } catch (err) {
    log.encryption.error(`Session recovery failed for ${conversationId}:${senderId}:`, err);
    return false;
  }
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

  // Content guard: file messages (IMAGE, VOICE, FILE) have encrypted=true
  // but content is a filename, not ciphertext. Don't try to decrypt filenames.
  if (!encryptedContent.startsWith('{"v":')) {
    return encryptedContent;
  }

  // Process X3DH header if present (first message)
  if (header) {
    await processX3DHHeader(conversationId, senderId, header);
  }

  // Deserialize encrypted message
  const encrypted = deserializeEncryptedMessage(encryptedContent);

  // Legacy v1 (Double Ratchet) messages cannot be decrypted with v2 conversation keys
  if (encrypted.version === 1) {
    throw new EncryptionError(
      'Legacy encrypted message (v1) — session key no longer available',
      'LEGACY_VERSION'
    );
  }

  // Decrypt message — auto-recover sessions when missing
  try {
    // Check if session exists; if not, try to re-establish from X3DH header
    const sessionExists = await hasSession(conversationId, senderId);
    if (!sessionExists) {
      const recovered = await tryRecoverSession(conversationId, senderId, encryptedContent);
      if (!recovered) {
        throw new EncryptionError('No session found and recovery failed', 'SESSION_NOT_FOUND');
      }
    }

    const plaintext = await decryptWithSession(conversationId, senderId, encrypted);
    return bytesToString(plaintext);
  } catch (error) {
    if (error instanceof EncryptionError && error.code === 'DECRYPTION_FAILED') {
      await removeSession(conversationId, senderId);
      log.encryption.warn(
        `Deleted corrupt session ${conversationId}:${senderId} — will re-establish on next message`
      );
    }
    throw error;
  }
}

/**
 * Encrypt a message for a group conversation
 *
 * Messenger Sender Key pattern:
 * - If this is the first message (no key yet), we return isNewKey=true so the
 *   caller can await distribution before sending. This guarantees recipients have
 *   the key before the message arrives.
 * - For subsequent messages the key already exists and was already distributed,
 *   so isNewKey=false and the caller can skip redistribution.
 *
 * @param conversationId - Group conversation ID
 * @param userId - Our user ID
 * @param content - Message content
 */
export async function encryptGroupMessageContent(
  conversationId: string,
  _userId: string, // kept for API compatibility — group key is shared, not per-sender
  content: string
): Promise<{ encryptedContent: string; senderKeyId: string; isNewKey: boolean }> {
  if (!isInitialized()) {
    await initialize();
  }

  // isNewKey: true if this is the first time we're encrypting for this group
  // (no group key existed yet). Signals the caller to AWAIT distribution before sending.
  const isNewKey = !(await hasGroupKey(conversationId));

  const plaintext = stringToBytes(content);
  const encrypted = await encryptGroupMessage(conversationId, plaintext);

  return {
    encryptedContent: serializeEncryptedMessage(encrypted),
    senderKeyId: encrypted.senderKeyId ?? '',
    isNewKey,
  };
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
  _senderId: string, // kept for API compatibility — all members share one key
  encryptedContent: string
): Promise<string> {
  if (!isInitialized()) {
    await initialize();
  }

  // Content guard: file messages have encrypted=true but content is a filename
  if (!encryptedContent.startsWith('{"v":')) {
    return encryptedContent;
  }

  const encrypted = deserializeEncryptedMessage(encryptedContent);

  try {
    const plaintext = await decryptGroupMessage(conversationId, encrypted);
    return bytesToString(plaintext);
  } catch (error) {
    if (error instanceof EncryptionError) {
      if (error.code === 'SESSION_NOT_FOUND') {
        // Group key missing locally — try recovering from server key backup
        const recovered = await tryRecoverGroupKey(conversationId);
        if (recovered) {
          const plaintext = await decryptGroupMessage(conversationId, encrypted);
          return bytesToString(plaintext);
        }
      } else if (error.code === 'DECRYPTION_FAILED') {
        // Stale/wrong key stored locally — recover from server backup (overwrites local key).
        // This can happen if a previous test session stored a different key for this conversation.
        log.encryption.warn(`[decryptGroupMessageContent] Wrong key for ${conversationId} — recovering from server backup`);
        const recovered = await tryRecoverGroupKey(conversationId);
        if (recovered) {
          try {
            const plaintext = await decryptGroupMessage(conversationId, encrypted);
            return bytesToString(plaintext);
          } catch {
            // Recovery didn't help — key on server is also wrong; throw original error
          }
        }
      }
    }
    throw error;
  }
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

// ==================== Group Key Backup & Recovery ====================

/**
 * Upload a group key backup to the server, encrypted with our own identity key.
 * Same format as DM ConversationKeyBackup — enables cross-device recovery.
 * Fire-and-forget — failures are non-critical.
 */
async function uploadGroupKeyBackup(
  conversationId: string,
  session: { conversationKey: Uint8Array; remoteIdentityKey: Uint8Array }
): Promise<void> {
  try {
    const ourKeys = await getIdentityKey();
    if (!ourKeys) return;

    // Pack conversationKey + 32 zero bytes (remoteIdentityKey unused for groups)
    const payload = new Uint8Array(64);
    payload.set(session.conversationKey, 0);
    // remoteIdentityKey slot left as zeros for group sessions

    const { ciphertext, nonce } = encrypt(payload, ourKeys.identityKeyPair.privateKey);

    await apiClient.post(`${ENCRYPTION_API}/keys/conversation`, {
      conversation_id: conversationId,
      encrypted_key: toBase64(ciphertext),
      nonce: toBase64(nonce),
    });

    log.encryption.debug(`Group key backup uploaded for ${conversationId}`);
  } catch (err) {
    log.encryption.warn(`Group key backup upload failed for ${conversationId}:`, err);
  }
}

/**
 * Try to recover the group key from the server-stored conversation key backup.
 * Mirrors tryRecoverFromKeyBackup but stores under GROUP_KEY_SENTINEL.
 *
 * Deduplicates concurrent calls per conversation — if multiple messages trigger
 * recovery simultaneously, they all await the same single API call.
 *
 * @returns true if group key was successfully restored
 */
function tryRecoverGroupKey(conversationId: string): Promise<boolean> {
  const existing = groupKeyRecoveryCache.get(conversationId);
  if (existing) return existing;

  const recovery = (async (): Promise<boolean> => {
    try {
      const response = await apiClient.get<{
        conversation_id: string;
        encrypted_key: string;
        nonce: string;
      }>(`${ENCRYPTION_API}/keys/conversation/${conversationId}`);

      const ourKeys = await getIdentityKey();
      if (!ourKeys) return false;

      const ciphertext = fromBase64(response.encrypted_key);
      const nonce = fromBase64(response.nonce);

      // Decrypt using our identity private key
      const payload = decrypt(ciphertext, nonce, ourKeys.identityKeyPair.privateKey);

      // First 32 bytes = conversationKey; next 32 are remoteIdentityKey (zeroed for groups)
      const conversationKey = payload.slice(0, 32);

      // Generate a recovery keyId since we don't have the original
      const groupKeyId = toHex(randomBytes(16));
      await storeReceivedGroupKey(conversationId, conversationKey, groupKeyId);

      log.encryption.info(`Group key recovered from backup for ${conversationId}`);
      return true;
    } catch {
      // Remove from cache on failure so a later manual retry can try again
      groupKeyRecoveryCache.delete(conversationId);
      return false;
    }
  })();

  groupKeyRecoveryCache.set(conversationId, recovery);
  return recovery;
}

// ==================== Sender Key Distribution ====================

/**
 * Distribute the group conversation key to all members.
 *
 * Reuses the existing sender-key distribution endpoint. The shared group key
 * is carried in the `public_key` field (repurposed from signing key to group key).
 * `chain_key` is null — there is no chain in the new static key model.
 *
 * The server stores this and relays it to online members via WebSocket.
 * Offline members fetch it when they next open the group chat.
 */
export async function distributeSenderKey(
  conversationId: string,
  _userId: string, // kept for API compatibility
  memberIds: string[]
): Promise<void> {
  // Messenger pattern: distribute once per session.
  // On re-visits (user clicks back into the same group), skip the network round-trips —
  // the key is already on the server and recipients already have it.
  if (distributedGroupKeys.has(conversationId)) {
    log.encryption.debug(`Group key already distributed this session for ${conversationId}, skipping`);
    return;
  }

  // On a new device, no group key exists locally — recover from server backup first.
  // This prevents generating a fresh key that would invalidate all existing encrypted messages.
  if (!(await hasGroupKey(conversationId))) {
    await tryRecoverGroupKey(conversationId);
  }

  // Get or create: if recovery succeeded we use the recovered key; only generates a new
  // random key if this is genuinely a brand-new group with no backup on the server yet.
  const session = await getOrCreateGroupKey(conversationId);

  // Distribute via server (stored + relayed to online members)
  await apiClient.post(`${ENCRYPTION_API}/sender-keys/distribute`, {
    conversation_id: conversationId,
    recipients: memberIds,
    distribution: {
      sender_key_id: session.groupKeyId,
      public_key: toBase64(session.conversationKey), // group key bytes
      chain_key: null, // no chain in static key model
    },
  });

  // Upload own backup so we can recover on new devices
  await uploadGroupKeyBackup(conversationId, session);

  // Mark as distributed for this session — future calls from Chat.tsx re-visits
  // or useSendMessage fire-and-forget calls will skip the network round-trips.
  distributedGroupKeys.add(conversationId);

  log.encryption.info(`Distributed group key ${session.groupKeyId} to ${memberIds.length} members for ${conversationId}`);
}

/**
 * Process received group key distribution (WS event or server-fetch path).
 *
 * The `public_key` field carries the shared group conversation key bytes.
 * The `key_id` field is the group key ID (used as senderKeyId in messages).
 * Always stores the received key (overwrite) — the latest distributed key wins.
 */
export async function receiveSenderKeyDistribution(
  data: {
    conversation_id: string;
    sender_id?: string; // unused in static key model
    key_id: string;
    chain_key?: string | null; // unused in static key model
    public_signing_key: string; // carries group key bytes (repurposed field)
  }
): Promise<void> {
  const groupKey = fromBase64(data.public_signing_key);
  const groupKeyId = data.key_id;

  await storeReceivedGroupKey(data.conversation_id, groupKey, groupKeyId);

  // Upload own backup for cross-device recovery
  const { getSession } = await import('../db/cryptoDb');
  const session = await getSession(data.conversation_id, GROUP_KEY_SENTINEL);
  if (session) {
    await uploadGroupKeyBackup(data.conversation_id, session);
  }
}

/**
 * Invalidate the session-level distribution cache for a conversation.
 * Must be called after key rotation so the next distributeSenderKey call
 * actually distributes the new key instead of returning early.
 */
export function invalidateGroupKeyDistribution(conversationId: string): void {
  distributedGroupKeys.delete(conversationId);
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
  groupKeyRecoveryCache.clear();
  distributedGroupKeys.clear();
  initStatus = 'uninitialized';
  log.encryption.info('Encryption data cleared');
}

// ==================== Own Message Decryption (Messenger Labyrinth pattern) ====================

/**
 * Decrypt the sender's own message using the conversation symmetric key.
 *
 * Messenger Labyrinth insight: the conversation key is symmetric — the same key
 * encrypts and decrypts. On a new device, we recover the key from the server-side
 * backup (encrypted with our identity key) rather than re-running X3DH.
 *
 * Steps:
 * 1. Find any existing session for this conversation (fast path)
 * 2. If no session, recover from server key backup → store under sentinel '__self__'
 * 3. Decrypt using the recovered conversation key
 */
export async function decryptOwnDirectMessage(
  conversationId: string,
  encryptedContent: string
): Promise<string> {
  if (!isInitialized()) {
    await initialize();
  }

  if (!encryptedContent.startsWith('{"v":')) {
    return encryptedContent;
  }

  const encrypted = deserializeEncryptedMessage(encryptedContent);
  if (encrypted.version === 1) {
    throw new EncryptionError(
      'Legacy encrypted message (v1) — session key no longer available',
      'LEGACY_VERSION'
    );
  }

  const { getConversationSessions, getSession } = await import('../db/cryptoDb');

  // Step 1: Try any existing session for this conversation
  const sessions = await getConversationSessions(conversationId);
  if (sessions.length > 0) {
    const { session } = sessions[0];
    try {
      const plaintext = decrypt(encrypted.ciphertext, encrypted.nonce, session.conversationKey);
      return bytesToString(plaintext);
    } catch {
      // Fall through to recovery
    }
  }

  // Step 2: No session locally — recover from server key backup (Messenger Labyrinth pattern)
  // Use sentinel '__self__' as remoteUserId since we're decrypting our own copy of the message
  const SELF_SENTINEL = '__self__';
  const recovered = await tryRecoverFromKeyBackup(conversationId, SELF_SENTINEL);
  if (!recovered) {
    throw new EncryptionError('No session and recovery failed', 'SESSION_NOT_FOUND');
  }

  // Step 3: Decrypt with recovered conversation key
  const recoveredSession = await getSession(conversationId, SELF_SENTINEL);
  if (!recoveredSession) {
    throw new EncryptionError('Recovered session not found', 'SESSION_NOT_FOUND');
  }

  const plaintext = decrypt(encrypted.ciphertext, encrypted.nonce, recoveredSession.conversationKey);
  return bytesToString(plaintext);
}

// Export encryption service object
export const encryptionService = {
  initialize,
  isInitialized,
  getInitStatus,
  establishSession,
  encryptDirectMessage,
  decryptDirectMessage,
  decryptOwnDirectMessage,
  encryptGroupMessageContent,
  decryptGroupMessageContent,
  encryptFile,
  decryptFile,
  distributeSenderKey,
  invalidateGroupKeyDistribution,
  receiveSenderKeyDistribution,
  serializeX3DHHeader,
  deserializeX3DHHeader,
  clearEncryptionData,
};

export default encryptionService;
