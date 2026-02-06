/**
 * IndexedDB Schema for E2EE Key Storage
 * Defines the database schema and migrations
 */

import { CRYPTO_DB_VERSION } from '../constants';

// Types for stored values
export interface IdentityStoreValue {
  id: string;
  identityKeyPair: {
    publicKey: string; // Base64
    privateKey: string; // Base64
    createdAt: number;
  };
  signedPreKey: {
    keyId: number;
    publicKey: string; // Base64
    privateKey: string; // Base64
    signature: string; // Base64
    createdAt: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface PreKeyStoreValue {
  keyId: number;
  publicKey: string; // Base64
  privateKey: string; // Base64
  used: boolean;
  createdAt: number;
}

export interface SessionStoreValue {
  id: string;
  conversationId: string;
  userId: string;
  state: string; // JSON-serialized SessionState
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface SenderKeyStoreValue {
  id: string;
  conversationId: string;
  userId: string;
  keyId: string;
  chainKey: string; // Base64
  publicSigningKey: string; // Base64
  privateSigningKey?: string; // Base64 (only for our own)
  chainIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface MessageKeyStoreValue {
  id: string;
  sessionId: string;
  publicKeyHex: string;
  messageIndex: number;
  messageKey: string; // Base64
  createdAt: number;
  expiresAt: number;
}

export interface KnownKeyStoreValue {
  userId: string;
  identityKey: string; // Base64
  verificationStatus: 'unverified' | 'verified' | 'key_changed';
  firstSeen: number;
  lastSeen: number;
  verifiedAt?: number;
}

/**
 * IndexedDB schema for E2EE key storage
 * Using explicit types instead of DBSchema to avoid index type issues
 */
export interface CryptoDBSchema {
  identity: {
    key: string;
    value: IdentityStoreValue;
  };
  prekeys: {
    key: number;
    value: PreKeyStoreValue;
    indexes: { byUsed: boolean };
  };
  sessions: {
    key: string;
    value: SessionStoreValue;
    indexes: { byConversation: string; byUser: string };
  };
  senderKeys: {
    key: string;
    value: SenderKeyStoreValue;
    indexes: { byConversation: string };
  };
  messageKeys: {
    key: string;
    value: MessageKeyStoreValue;
    indexes: { bySession: string; byExpiry: number };
  };
}

/**
 * Database version for migrations
 */
export const DB_VERSION = CRYPTO_DB_VERSION;

/**
 * Store names exported for convenience
 * These must match the literal keys in CryptoDBSchema
 */
export const STORES = {
  IDENTITY: 'identity' as const,
  PREKEY: 'prekeys' as const,
  SESSION: 'sessions' as const,
  SENDER_KEY: 'senderKeys' as const,
  MESSAGE_KEY: 'messageKeys' as const,
  KNOWN_KEYS: 'knownIdentityKeys' as const,
};
