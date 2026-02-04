/**
 * E2EE Feature Module
 * Exports all encryption-related services, hooks, and types
 */

// Services
export { cryptoService } from './services/cryptoService';
export { keyService } from './services/keyService';
export { sessionService } from './services/sessionService';
export { groupCryptoService } from './services/groupCryptoService';
export {
  encryptionService,
  initialize as initializeEncryption,
  isInitialized as isEncryptionInitialized,
  clearEncryptionData,
} from './services/encryptionService';

// Hooks
export { useEncryption } from './hooks/useEncryption';
export { useKeyExchange } from './hooks/useKeyExchange';

// Store
export {
  useEncryptionStore,
  selectInitStatus,
  selectIsInitialized,
  selectIsInitializing,
  selectConversationEncryption,
  selectIsConversationEncrypted,
} from './stores/keyStore';

// Types
export type {
  KeyPair,
  IdentityKeyPair,
  SignedPreKey,
  OneTimePreKey,
  PublicKeyBundle,
  LocalKeyBundle,
  X3DHHeader,
  SessionState,
  SenderKey,
  SenderKeyDistribution,
  EncryptedMessage,
  EncryptedFile,
  EncryptionInitStatus,
  SessionStatus,
  ConversationEncryptionState,
  EncryptionErrorCode,
} from './types';

export { EncryptionError } from './types';

// Constants
export {
  ENCRYPTION_VERSION,
  ALGORITHM,
  KEY_SIZE,
  NONCE_SIZE,
} from './constants';
