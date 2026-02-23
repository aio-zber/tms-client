/**
 * Key Backup Service
 * PIN-protected encrypted key backup and restore (Viber-style)
 *
 * Flow:
 * 1. Backup: PIN → Argon2id → 256-bit key → XSalsa20-Poly1305 encrypt → upload
 * 2. Restore: download → PIN → Argon2id → decrypt → store in IndexedDB
 *
 * The PIN never leaves the client. The server only stores encrypted blobs.
 */

import _sodium from 'libsodium-wrappers-sumo';
import { apiClient } from '@/lib/apiClient';
import {
  initCrypto,
  encrypt,
  decrypt,
  toBase64,
  fromBase64,
  sha256,
  toHex,
  wipeMemory,
  stringToBytes,
  bytesToString,
} from './cryptoService';
import { getIdentityKey, storeIdentityKey } from '../db/cryptoDb';
import {
  BACKUP_VERSION,
  PIN_LENGTH,
  KDF_OPS_LIMIT,
  KDF_MEM_LIMIT,
  KDF_SALT_LENGTH,
} from '../constants';
import { EncryptionError } from '../types';
import type { KeyBackupData, KeyBackupStatus, KeyBackupServerResponse } from '../types';
import { log } from '@/lib/logger';

const ENCRYPTION_API = '/encryption';

/**
 * Derive a 256-bit encryption key from PIN using Argon2id
 */
async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  await _sodium.ready;
  const sodium = _sodium;

  const pinBytes = stringToBytes(pin);

  const derivedKey = sodium.crypto_pwhash(
    32, // 256-bit key
    pinBytes,
    salt,
    KDF_OPS_LIMIT,
    KDF_MEM_LIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  return derivedKey;
}

/**
 * Validate that a PIN is exactly 6 digits
 */
function validatePin(pin: string): void {
  if (!pin || pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    throw new EncryptionError(
      `PIN must be exactly ${PIN_LENGTH} digits`,
      'INVALID_PIN'
    );
  }
}

/**
 * Create an encrypted key backup and upload to server
 */
export async function createKeyBackup(pin: string): Promise<void> {
  validatePin(pin);
  await initCrypto();

  // Load keys from IndexedDB
  const keys = await getIdentityKey();
  if (!keys) {
    throw new EncryptionError('No local keys to backup', 'BACKUP_FAILED');
  }

  // Serialize key data
  const backupData: KeyBackupData = {
    identityKeyPair: {
      publicKey: toBase64(keys.identityKeyPair.publicKey),
      privateKey: toBase64(keys.identityKeyPair.privateKey),
      signingKey: keys.identityKeyPair.signingKey
        ? toBase64(keys.identityKeyPair.signingKey)
        : undefined,
      createdAt: keys.identityKeyPair.createdAt,
    },
    signedPreKey: {
      keyId: keys.signedPreKey.keyId,
      publicKey: toBase64(keys.signedPreKey.keyPair.publicKey),
      privateKey: toBase64(keys.signedPreKey.keyPair.privateKey),
      signature: toBase64(keys.signedPreKey.signature),
      createdAt: keys.signedPreKey.createdAt,
    },
    backupTimestamp: Date.now(),
  };

  const plaintext = stringToBytes(JSON.stringify(backupData));

  // Generate salt and derive key from PIN
  await _sodium.ready;
  const salt = _sodium.randombytes_buf(KDF_SALT_LENGTH);
  const derivedKey = await deriveKeyFromPin(pin, salt);

  let encryptedResult: { ciphertext: Uint8Array; nonce: Uint8Array };
  try {
    // Encrypt with XSalsa20-Poly1305
    encryptedResult = encrypt(plaintext, derivedKey);

    // Compute identity key hash for verification
    const identityKeyHash = toHex(sha256(keys.identityKeyPair.publicKey));

    // Upload to server
    await apiClient.post(`${ENCRYPTION_API}/keys/backup`, {
      encrypted_data: toBase64(encryptedResult.ciphertext),
      nonce: toBase64(encryptedResult.nonce),
      salt: toBase64(salt),
      key_derivation: 'argon2id',
      version: BACKUP_VERSION,
      identity_key_hash: identityKeyHash,
    });

    log.encryption.info('Key backup created and uploaded');
  } finally {
    // Wipe sensitive data from memory
    wipeMemory(derivedKey);
    wipeMemory(plaintext);
  }
}

/**
 * Download and restore keys from server backup
 */
export async function restoreKeyBackup(pin: string): Promise<void> {
  validatePin(pin);
  await initCrypto();

  // Download encrypted backup from server
  let backup: KeyBackupServerResponse;
  try {
    backup = await apiClient.get<KeyBackupServerResponse>(
      `${ENCRYPTION_API}/keys/backup`
    );
  } catch {
    throw new EncryptionError('No backup found on server', 'RESTORE_FAILED');
  }

  // Decode server data
  const encryptedData = fromBase64(backup.encrypted_data);
  const nonce = fromBase64(backup.nonce);
  const salt = fromBase64(backup.salt);

  // Derive key from PIN + stored salt
  const derivedKey = await deriveKeyFromPin(pin, salt);

  let plaintext: Uint8Array;
  try {
    // Decrypt — failure means wrong PIN
    try {
      plaintext = decrypt(encryptedData, nonce, derivedKey);
    } catch {
      throw new EncryptionError(
        'Invalid PIN or corrupted backup',
        'INVALID_PIN'
      );
    }

    // Parse backup data
    const backupData: KeyBackupData = JSON.parse(bytesToString(plaintext));

    // Verify identity key hash matches
    const restoredPubKey = fromBase64(backupData.identityKeyPair.publicKey);
    const computedHash = toHex(sha256(restoredPubKey));
    if (computedHash !== backup.identity_key_hash) {
      throw new EncryptionError(
        'Backup integrity check failed',
        'RESTORE_FAILED'
      );
    }

    // Restore keys to IndexedDB
    await storeIdentityKey(
      {
        publicKey: fromBase64(backupData.identityKeyPair.publicKey),
        privateKey: fromBase64(backupData.identityKeyPair.privateKey),
        signingKey: backupData.identityKeyPair.signingKey
          ? fromBase64(backupData.identityKeyPair.signingKey)
          : undefined,
        createdAt: backupData.identityKeyPair.createdAt,
      },
      {
        keyId: backupData.signedPreKey.keyId,
        keyPair: {
          publicKey: fromBase64(backupData.signedPreKey.publicKey),
          privateKey: fromBase64(backupData.signedPreKey.privateKey),
        },
        signature: fromBase64(backupData.signedPreKey.signature),
        createdAt: backupData.signedPreKey.createdAt,
      }
    );

    log.encryption.info('Key backup restored successfully');
  } finally {
    wipeMemory(derivedKey);
  }
}

/**
 * Check if a backup exists on the server
 */
export async function getBackupStatus(): Promise<KeyBackupStatus> {
  const response = await apiClient.get<KeyBackupStatus>(
    `${ENCRYPTION_API}/keys/backup/status`
  );
  return response;
}

export const backupService = {
  createKeyBackup,
  restoreKeyBackup,
  getBackupStatus,
};

export default backupService;
