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
  reinitialize as reinitializeEncryption,
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
  selectIdentityKeyChanged,
  selectHasBackup,
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
  ConversationKeySession,
  SenderKey,
  SenderKeyDistribution,
  EncryptedMessage,
  EncryptedFile,
  EncryptionInitStatus,
  SessionStatus,
  ConversationEncryptionState,
  EncryptionErrorCode,
  KeyBackupStatus,
  VerificationStatus,
} from './types';

export { EncryptionError } from './types';

// Backup & Verification Services
export { backupService } from './services/backupService';
export { verificationService } from './services/verificationService';

// UI Components
export { SecurityTab } from './components/SecurityTab';
export { KeyBackupDialog } from './components/KeyBackupDialog';
export { KeyChangeBanner } from './components/KeyChangeBanner';
export { EncryptionGate } from './components/EncryptionGate';

// Constants
export {
  ENCRYPTION_VERSION,
  ALGORITHM,
  KEY_SIZE,
  NONCE_SIZE,
} from './constants';
