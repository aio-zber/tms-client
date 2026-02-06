/**
 * E2EE Type Definitions
 * Types for end-to-end encryption implementation
 */

// ==================== Key Types ====================

/**
 * Curve25519 key pair for identity and ephemeral keys
 */
export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * User's long-term identity key pair
 */
export interface IdentityKeyPair extends KeyPair {
  createdAt: number;
}

/**
 * Signed pre-key with signature for authentication
 */
export interface SignedPreKey {
  keyId: number;
  keyPair: KeyPair;
  signature: Uint8Array;
  createdAt: number;
}

/**
 * One-time pre-key (consumed once per session)
 */
export interface OneTimePreKey {
  keyId: number;
  keyPair: KeyPair;
}

/**
 * Public key bundle for X3DH key exchange
 * Sent to server for other users to initiate sessions
 */
export interface PublicKeyBundle {
  identityKey: Uint8Array;
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array;
    signature: Uint8Array;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: Uint8Array;
  }>;
}

/**
 * Key bundle stored locally (includes private keys)
 */
export interface LocalKeyBundle {
  identityKeyPair: IdentityKeyPair;
  signedPreKey: SignedPreKey;
  oneTimePreKeys: OneTimePreKey[];
}

// ==================== Session Types ====================

/**
 * X3DH session initialization data
 * Sent with first message to recipient
 */
export interface X3DHHeader {
  identityKey: Uint8Array; // Sender's identity key
  ephemeralKey: Uint8Array; // Sender's ephemeral key
  preKeyId?: number; // One-time pre-key ID used (optional)
  signedPreKeyId: number; // Signed pre-key ID used
}

/**
 * Double Ratchet chain key state
 */
export interface ChainKey {
  key: Uint8Array;
  index: number;
}

/**
 * Double Ratchet session state
 */
export interface SessionState {
  // Remote party info
  remoteIdentityKey: Uint8Array;
  remotePublicKey: Uint8Array; // Current ratchet public key

  // Our ratchet key pair
  localKeyPair: KeyPair;

  // Root key for deriving new chain keys
  rootKey: Uint8Array;

  // Sending chain
  sendingChainKey: ChainKey;

  // Receiving chain
  receivingChainKey: ChainKey;

  // Previous sending chains (for out-of-order messages)
  previousSendingChains: Array<{
    publicKey: Uint8Array;
    chainKey: ChainKey;
    messageKeys: Map<number, Uint8Array>;
  }>;

  // Skipped message keys (for out-of-order messages)
  skippedMessageKeys: Map<string, Uint8Array>; // key format: `${publicKeyHex}:${messageIndex}`

  // Message counters
  sendingMessageNumber: number;
  receivingMessageNumber: number;
  previousSendingChainLength: number;

  // Session metadata
  createdAt: number;
  updatedAt: number;
}

/**
 * Stored session (per conversation + user pair)
 */
export interface StoredSession {
  id: string; // `${conversationId}:${userId}`
  conversationId: string;
  userId: string;
  state: SessionState;
  version: number;
}

// ==================== Sender Key Types (for groups) ====================

/**
 * Sender key for group messaging
 */
export interface SenderKey {
  keyId: string;
  chainKey: Uint8Array;
  publicSigningKey: Uint8Array;
  privateSigningKey?: Uint8Array; // Only present for our own sender key
}

/**
 * Sender key distribution message
 */
export interface SenderKeyDistribution {
  conversationId: string;
  senderId: string;
  keyId: string;
  chainKey: Uint8Array;
  publicSigningKey: Uint8Array;
}

/**
 * Group session state
 */
export interface GroupSessionState {
  conversationId: string;
  mySenderKey: SenderKey;
  memberSenderKeys: Map<string, SenderKey>; // userId -> SenderKey
  createdAt: number;
  updatedAt: number;
}

// ==================== Message Encryption Types ====================

/**
 * Encrypted message envelope
 */
export interface EncryptedMessage {
  version: number;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  header?: X3DHHeader; // Present only for initial messages
  senderKeyId?: string; // Present only for group messages
  messageNumber?: number; // For Double Ratchet
  previousChainLength?: number; // For Double Ratchet
}

/**
 * Encrypted file data
 */
export interface EncryptedFile {
  version: number;
  encryptedData: Uint8Array;
  nonce: Uint8Array;
  fileKey: Uint8Array; // Encrypted with session key
  fileKeyNonce: Uint8Array;
  originalSize: number;
  mimeType: string;
}

// ==================== API Types ====================

/**
 * Key bundle upload request
 */
export interface UploadKeyBundleRequest {
  identity_key: string; // Base64
  signed_prekey: {
    key_id: number;
    public_key: string; // Base64
    signature: string; // Base64
  };
  one_time_prekeys: Array<{
    key_id: number;
    public_key: string; // Base64
  }>;
}

/**
 * Key bundle fetch response
 */
export interface FetchKeyBundleResponse {
  user_id: string;
  identity_key: string; // Base64
  signed_prekey: {
    key_id: number;
    public_key: string; // Base64
    signature: string; // Base64
  };
  one_time_prekey?: {
    key_id: number;
    public_key: string; // Base64
  };
}

// ==================== Encryption Status Types ====================

/**
 * E2EE initialization status
 */
export type EncryptionInitStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'needs_restore'
  | 'error';

/**
 * Session establishment status
 */
export type SessionStatus =
  | 'none'
  | 'establishing'
  | 'active'
  | 'error';

/**
 * Encryption state for a conversation
 */
export interface ConversationEncryptionState {
  conversationId: string;
  enabled: boolean;
  status: SessionStatus;
  sessionId?: string;
  lastKeyRotation?: number;
  error?: string;
}

// ==================== Error Types ====================

export class EncryptionError extends Error {
  constructor(
    message: string,
    public code: EncryptionErrorCode,
    public cause?: Error
  ) {
    super(message);
    this.name = 'EncryptionError';
  }
}

export type EncryptionErrorCode =
  | 'INIT_FAILED'
  | 'KEY_GENERATION_FAILED'
  | 'KEY_BUNDLE_FETCH_FAILED'
  | 'KEY_BUNDLE_UPLOAD_FAILED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ESTABLISHMENT_FAILED'
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'SIGNATURE_VERIFICATION_FAILED'
  | 'INVALID_MESSAGE_FORMAT'
  | 'DUPLICATE_MESSAGE'
  | 'MESSAGE_TOO_OLD'
  | 'DB_ERROR'
  | 'BACKUP_FAILED'
  | 'RESTORE_FAILED'
  | 'INVALID_PIN';

// ==================== Key Backup Types ====================

export interface KeyBackupData {
  identityKeyPair: {
    publicKey: string;
    privateKey: string;
    createdAt: number;
  };
  signedPreKey: {
    keyId: number;
    publicKey: string;
    privateKey: string;
    signature: string;
    createdAt: number;
  };
  backupTimestamp: number;
}

export interface KeyBackupStatus {
  has_backup: boolean;
  created_at: string | null;
  identity_key_hash: string | null;
}

export interface KeyBackupServerResponse {
  encrypted_data: string;
  nonce: string;
  salt: string;
  key_derivation: string;
  version: number;
  identity_key_hash: string;
  created_at: string;
}

// ==================== Verification Types ====================

export type VerificationStatus = 'unverified' | 'verified' | 'key_changed';
