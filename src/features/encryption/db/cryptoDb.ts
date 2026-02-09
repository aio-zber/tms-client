/**
 * IndexedDB Operations for E2EE Key Storage
 * Handles all database CRUD operations for cryptographic keys
 */

import { openDB, IDBPDatabase } from 'idb';
import { STORES, DB_VERSION } from './schema';
import { CRYPTO_DB_NAME } from '../constants';
import type {
  IdentityKeyPair,
  SignedPreKey,
  OneTimePreKey,
  SessionState,
  SenderKey,
  VerificationStatus,
} from '../types';
import type { KnownKeyStoreValue } from './schema';
import { log } from '@/lib/logger';

// Use any for DB type to avoid complex generics with custom schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: IDBPDatabase<any> | null = null;

/**
 * Initialize and get the database instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDb(): Promise<IDBPDatabase<any>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB(CRYPTO_DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, _transaction) {
      log.encryption.info(`Upgrading crypto DB from v${oldVersion} to v${newVersion}`);

      // Create identity store
      if (!db.objectStoreNames.contains(STORES.IDENTITY)) {
        db.createObjectStore(STORES.IDENTITY, { keyPath: 'id' });
      }

      // Create pre-key store with index
      if (!db.objectStoreNames.contains(STORES.PREKEY)) {
        const prekeyStore = db.createObjectStore(STORES.PREKEY, { keyPath: 'keyId' });
        prekeyStore.createIndex('byUsed', 'used');
      }

      // Create session store with indexes
      if (!db.objectStoreNames.contains(STORES.SESSION)) {
        const sessionStore = db.createObjectStore(STORES.SESSION, { keyPath: 'id' });
        sessionStore.createIndex('byConversation', 'conversationId');
        sessionStore.createIndex('byUser', 'userId');
      }

      // Create sender key store with index
      if (!db.objectStoreNames.contains(STORES.SENDER_KEY)) {
        const senderKeyStore = db.createObjectStore(STORES.SENDER_KEY, { keyPath: 'id' });
        senderKeyStore.createIndex('byConversation', 'conversationId');
      }

      // Create message key store with indexes
      if (!db.objectStoreNames.contains(STORES.MESSAGE_KEY)) {
        const messageKeyStore = db.createObjectStore(STORES.MESSAGE_KEY, { keyPath: 'id' });
        messageKeyStore.createIndex('bySession', 'sessionId');
        messageKeyStore.createIndex('byExpiry', 'expiresAt');
      }

      // v2: Create known identity keys store for verification
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORES.KNOWN_KEYS)) {
          db.createObjectStore(STORES.KNOWN_KEYS, { keyPath: 'userId' });
        }
      }
    },
    blocked() {
      log.encryption.warn('Crypto DB upgrade blocked - close other tabs');
    },
    blocking() {
      log.encryption.warn('Crypto DB blocking newer version');
      dbInstance?.close();
      dbInstance = null;
    },
  });

  return dbInstance;
}

/**
 * Close the database connection
 */
export async function closeDb(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Clear all data from the database (for logout)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const storeNames = [
    STORES.IDENTITY, STORES.PREKEY, STORES.SESSION,
    STORES.SENDER_KEY, STORES.MESSAGE_KEY, STORES.KNOWN_KEYS,
  ];
  const tx = db.transaction(storeNames, 'readwrite');

  await Promise.all([
    ...storeNames.map((name) => tx.objectStore(name).clear()),
    tx.done,
  ]);

  log.encryption.info('Cleared all crypto data from database');
}

// ==================== Identity Key Operations ====================

/**
 * Store the local identity key pair
 */
export async function storeIdentityKey(
  identityKeyPair: IdentityKeyPair,
  signedPreKey: SignedPreKey
): Promise<void> {
  const db = await getDb();
  const now = Date.now();

  await db.put(STORES.IDENTITY, {
    id: 'local',
    identityKeyPair: {
      publicKey: uint8ArrayToBase64(identityKeyPair.publicKey),
      privateKey: uint8ArrayToBase64(identityKeyPair.privateKey),
      signingKey: identityKeyPair.signingKey
        ? uint8ArrayToBase64(identityKeyPair.signingKey)
        : undefined,
      createdAt: identityKeyPair.createdAt,
    },
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: uint8ArrayToBase64(signedPreKey.keyPair.publicKey),
      privateKey: uint8ArrayToBase64(signedPreKey.keyPair.privateKey),
      signature: uint8ArrayToBase64(signedPreKey.signature),
      createdAt: signedPreKey.createdAt,
    },
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Get the local identity key pair
 */
export async function getIdentityKey(): Promise<{
  identityKeyPair: IdentityKeyPair;
  signedPreKey: SignedPreKey;
} | null> {
  const db = await getDb();
  const stored = await db.get(STORES.IDENTITY, 'local');

  if (!stored) {
    return null;
  }

  return {
    identityKeyPair: {
      publicKey: base64ToUint8Array(stored.identityKeyPair.publicKey),
      privateKey: base64ToUint8Array(stored.identityKeyPair.privateKey),
      signingKey: stored.identityKeyPair.signingKey
        ? base64ToUint8Array(stored.identityKeyPair.signingKey)
        : undefined,
      createdAt: stored.identityKeyPair.createdAt,
    },
    signedPreKey: {
      keyId: stored.signedPreKey.keyId,
      keyPair: {
        publicKey: base64ToUint8Array(stored.signedPreKey.publicKey),
        privateKey: base64ToUint8Array(stored.signedPreKey.privateKey),
      },
      signature: base64ToUint8Array(stored.signedPreKey.signature),
      createdAt: stored.signedPreKey.createdAt,
    },
  };
}

/**
 * Check if identity keys exist
 */
export async function hasIdentityKey(): Promise<boolean> {
  const db = await getDb();
  const stored = await db.get(STORES.IDENTITY, 'local');
  return stored !== undefined;
}

// ==================== Pre-Key Operations ====================

/**
 * Store one-time pre-keys
 */
export async function storePreKeys(preKeys: OneTimePreKey[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORES.PREKEY, 'readwrite');
  const store = tx.objectStore(STORES.PREKEY);
  const now = Date.now();

  await Promise.all([
    ...preKeys.map((pk) =>
      store.put({
        keyId: pk.keyId,
        publicKey: uint8ArrayToBase64(pk.keyPair.publicKey),
        privateKey: uint8ArrayToBase64(pk.keyPair.privateKey),
        used: 0,
        createdAt: now,
      })
    ),
    tx.done,
  ]);
}

/**
 * Get an unused pre-key and mark it as used
 */
export async function consumePreKey(keyId: number): Promise<OneTimePreKey | null> {
  const db = await getDb();
  const stored = await db.get(STORES.PREKEY, keyId);

  if (!stored || stored.used === 1) {
    return null;
  }

  // Mark as used
  await db.put(STORES.PREKEY, { ...stored, used: 1 });

  return {
    keyId: stored.keyId,
    keyPair: {
      publicKey: base64ToUint8Array(stored.publicKey),
      privateKey: base64ToUint8Array(stored.privateKey),
    },
  };
}

/**
 * Get count of unused pre-keys
 */
export async function getUnusedPreKeyCount(): Promise<number> {
  const db = await getDb();
  const unused = await db.getAllFromIndex(STORES.PREKEY, 'byUsed', 0);
  return unused.length;
}

/**
 * Get all unused pre-keys (for key bundle)
 */
export async function getUnusedPreKeys(): Promise<OneTimePreKey[]> {
  const db = await getDb();
  const stored = await db.getAllFromIndex(STORES.PREKEY, 'byUsed', 0);

  return stored.map((pk) => ({
    keyId: pk.keyId,
    publicKey: base64ToUint8Array(pk.publicKey),
    privateKey: base64ToUint8Array(pk.privateKey),
    keyPair: {
      publicKey: base64ToUint8Array(pk.publicKey),
      privateKey: base64ToUint8Array(pk.privateKey),
    },
  }));
}

/**
 * Delete used pre-keys (cleanup)
 */
export async function deleteUsedPreKeys(): Promise<number> {
  const db = await getDb();
  const used = await db.getAllFromIndex(STORES.PREKEY, 'byUsed', 1);
  const tx = db.transaction(STORES.PREKEY, 'readwrite');

  await Promise.all([
    ...used.map((pk) => tx.objectStore(STORES.PREKEY).delete(pk.keyId)),
    tx.done,
  ]);

  return used.length;
}

// ==================== Session Operations ====================

/**
 * Store a Double Ratchet session
 */
export async function storeSession(
  conversationId: string,
  userId: string,
  state: SessionState
): Promise<void> {
  const db = await getDb();
  const id = `${conversationId}:${userId}`;
  const now = Date.now();

  await db.put(STORES.SESSION, {
    id,
    conversationId,
    userId,
    state: serializeSessionState(state),
    version: 1,
    createdAt: state.createdAt,
    updatedAt: now,
  });
}

/**
 * Get a session by conversation and user
 */
export async function getSession(
  conversationId: string,
  userId: string
): Promise<SessionState | null> {
  const db = await getDb();
  const id = `${conversationId}:${userId}`;
  const stored = await db.get(STORES.SESSION, id);

  if (!stored) {
    return null;
  }

  return deserializeSessionState(stored.state);
}

/**
 * Get all sessions for a conversation
 */
export async function getConversationSessions(
  conversationId: string
): Promise<Array<{ userId: string; state: SessionState }>> {
  const db = await getDb();
  const sessions = await db.getAllFromIndex(STORES.SESSION, 'byConversation', conversationId);

  return sessions.map((s) => ({
    userId: s.userId,
    state: deserializeSessionState(s.state),
  }));
}

/**
 * Delete a session
 */
export async function deleteSession(conversationId: string, userId: string): Promise<void> {
  const db = await getDb();
  const id = `${conversationId}:${userId}`;
  await db.delete(STORES.SESSION, id);
}

// ==================== Sender Key Operations ====================

/**
 * Store a sender key for group messaging
 */
export async function storeSenderKey(
  conversationId: string,
  userId: string,
  senderKey: SenderKey,
  isLocal: boolean = false
): Promise<void> {
  const db = await getDb();
  const id = `${conversationId}:${userId}`;
  const now = Date.now();

  await db.put(STORES.SENDER_KEY, {
    id,
    conversationId,
    userId,
    keyId: senderKey.keyId,
    chainKey: uint8ArrayToBase64(senderKey.chainKey),
    publicSigningKey: uint8ArrayToBase64(senderKey.publicSigningKey),
    privateSigningKey: isLocal && senderKey.privateSigningKey
      ? uint8ArrayToBase64(senderKey.privateSigningKey)
      : undefined,
    chainIndex: 0,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Get a sender key
 */
export async function getSenderKey(
  conversationId: string,
  userId: string
): Promise<SenderKey | null> {
  const db = await getDb();
  const id = `${conversationId}:${userId}`;
  const stored = await db.get(STORES.SENDER_KEY, id);

  if (!stored) {
    return null;
  }

  return {
    keyId: stored.keyId,
    chainKey: base64ToUint8Array(stored.chainKey),
    publicSigningKey: base64ToUint8Array(stored.publicSigningKey),
    privateSigningKey: stored.privateSigningKey
      ? base64ToUint8Array(stored.privateSigningKey)
      : undefined,
  };
}

/**
 * Get all sender keys for a conversation
 */
export async function getConversationSenderKeys(
  conversationId: string
): Promise<Array<{ userId: string; senderKey: SenderKey }>> {
  const db = await getDb();
  const keys = await db.getAllFromIndex(STORES.SENDER_KEY, 'byConversation', conversationId);

  return keys.map((k) => ({
    userId: k.userId,
    senderKey: {
      keyId: k.keyId,
      chainKey: base64ToUint8Array(k.chainKey),
      publicSigningKey: base64ToUint8Array(k.publicSigningKey),
      privateSigningKey: k.privateSigningKey
        ? base64ToUint8Array(k.privateSigningKey)
        : undefined,
    },
  }));
}

// ==================== Message Key Operations ====================

/**
 * Store a skipped message key
 */
export async function storeMessageKey(
  sessionId: string,
  publicKeyHex: string,
  messageIndex: number,
  messageKey: Uint8Array
): Promise<void> {
  const db = await getDb();
  const id = `${sessionId}:${publicKeyHex}:${messageIndex}`;
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  await db.put(STORES.MESSAGE_KEY, {
    id,
    sessionId,
    publicKeyHex,
    messageIndex,
    messageKey: uint8ArrayToBase64(messageKey),
    createdAt: now,
    expiresAt,
  });
}

/**
 * Get and delete a message key (one-time use)
 */
export async function consumeMessageKey(
  sessionId: string,
  publicKeyHex: string,
  messageIndex: number
): Promise<Uint8Array | null> {
  const db = await getDb();
  const id = `${sessionId}:${publicKeyHex}:${messageIndex}`;
  const stored = await db.get(STORES.MESSAGE_KEY, id);

  if (!stored) {
    return null;
  }

  // Delete after retrieval
  await db.delete(STORES.MESSAGE_KEY, id);

  return base64ToUint8Array(stored.messageKey);
}

/**
 * Delete expired message keys
 */
export async function deleteExpiredMessageKeys(): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const expired = await db.getAllFromIndex(STORES.MESSAGE_KEY, 'byExpiry', IDBKeyRange.upperBound(now));
  const tx = db.transaction(STORES.MESSAGE_KEY, 'readwrite');

  await Promise.all([
    ...expired.map((mk) => tx.objectStore(STORES.MESSAGE_KEY).delete(mk.id)),
    tx.done,
  ]);

  return expired.length;
}

// ==================== Known Identity Key Operations ====================

/**
 * Store or update a known identity key for a user
 */
export async function storeKnownIdentityKey(
  userId: string,
  identityKey: string,
  status: VerificationStatus
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const existing = await db.get(STORES.KNOWN_KEYS, userId);

  const value: KnownKeyStoreValue = {
    userId,
    identityKey,
    verificationStatus: status,
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
    verifiedAt: status === 'verified' ? now : existing?.verifiedAt,
  };

  await db.put(STORES.KNOWN_KEYS, value);
}

/**
 * Get a known identity key for a user
 */
export async function getKnownIdentityKey(
  userId: string
): Promise<KnownKeyStoreValue | null> {
  const db = await getDb();
  const stored = await db.get(STORES.KNOWN_KEYS, userId);
  return stored ?? null;
}

/**
 * Update verification status for a known key
 */
export async function setVerificationStatus(
  userId: string,
  status: VerificationStatus
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORES.KNOWN_KEYS, userId);
  if (!existing) return;

  existing.verificationStatus = status;
  if (status === 'verified') {
    existing.verifiedAt = Date.now();
  }
  existing.lastSeen = Date.now();

  await db.put(STORES.KNOWN_KEYS, existing);
}

// ==================== Helper Functions ====================

/**
 * Convert Uint8Array to Base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Serialize SessionState for storage
 */
function serializeSessionState(state: SessionState): string {
  // Convert all Uint8Arrays to Base64 and Maps to objects
  const serializable = {
    ...state,
    remoteIdentityKey: uint8ArrayToBase64(state.remoteIdentityKey),
    remotePublicKey: uint8ArrayToBase64(state.remotePublicKey),
    localKeyPair: {
      publicKey: uint8ArrayToBase64(state.localKeyPair.publicKey),
      privateKey: uint8ArrayToBase64(state.localKeyPair.privateKey),
    },
    rootKey: uint8ArrayToBase64(state.rootKey),
    sendingChainKey: {
      key: uint8ArrayToBase64(state.sendingChainKey.key),
      index: state.sendingChainKey.index,
    },
    receivingChainKey: {
      key: uint8ArrayToBase64(state.receivingChainKey.key),
      index: state.receivingChainKey.index,
    },
    previousSendingChains: state.previousSendingChains.map((chain) => ({
      publicKey: uint8ArrayToBase64(chain.publicKey),
      chainKey: {
        key: uint8ArrayToBase64(chain.chainKey.key),
        index: chain.chainKey.index,
      },
      messageKeys: Object.fromEntries(
        Array.from(chain.messageKeys.entries()).map(([k, v]) => [k, uint8ArrayToBase64(v)])
      ),
    })),
    skippedMessageKeys: Object.fromEntries(
      Array.from(state.skippedMessageKeys.entries()).map(([k, v]) => [k, uint8ArrayToBase64(v)])
    ),
  };

  return JSON.stringify(serializable);
}

/**
 * Deserialize SessionState from storage
 */
function deserializeSessionState(json: string): SessionState {
  const parsed = JSON.parse(json);

  return {
    ...parsed,
    remoteIdentityKey: base64ToUint8Array(parsed.remoteIdentityKey),
    remotePublicKey: base64ToUint8Array(parsed.remotePublicKey),
    localKeyPair: {
      publicKey: base64ToUint8Array(parsed.localKeyPair.publicKey),
      privateKey: base64ToUint8Array(parsed.localKeyPair.privateKey),
    },
    rootKey: base64ToUint8Array(parsed.rootKey),
    sendingChainKey: {
      key: base64ToUint8Array(parsed.sendingChainKey.key),
      index: parsed.sendingChainKey.index,
    },
    receivingChainKey: {
      key: base64ToUint8Array(parsed.receivingChainKey.key),
      index: parsed.receivingChainKey.index,
    },
    previousSendingChains: parsed.previousSendingChains.map((chain: {
      publicKey: string;
      chainKey: { key: string; index: number };
      messageKeys: Record<string, string>;
    }) => ({
      publicKey: base64ToUint8Array(chain.publicKey),
      chainKey: {
        key: base64ToUint8Array(chain.chainKey.key),
        index: chain.chainKey.index,
      },
      messageKeys: new Map(
        Object.entries(chain.messageKeys).map(([k, v]) => [Number(k), base64ToUint8Array(v)])
      ),
    })),
    skippedMessageKeys: new Map(
      Object.entries(parsed.skippedMessageKeys).map(([k, v]) => [k, base64ToUint8Array(v as string)])
    ),
  };
}
