/**
 * Verification Service
 * Identity key verification and safety number generation
 *
 * Tracks known identity keys per user and detects when they change,
 * indicating either a new device or potential MITM attack.
 */

import { generateSafetyNumber, getLocalIdentityKey } from './keyService';
import { fromBase64 } from './cryptoService';
import {
  storeKnownIdentityKey,
  getKnownIdentityKey,
  setVerificationStatus as dbSetVerificationStatus,
} from '../db/cryptoDb';
import type { VerificationStatus } from '../types';
import { log } from '@/lib/logger';

/**
 * Check if a contact's identity key has changed since last seen.
 *
 * - First time seeing this user: stores key as 'unverified', returns 'unverified'
 * - Same key as before: returns existing status (may be 'verified')
 * - Different key: updates to 'key_changed', returns 'key_changed'
 */
export async function checkIdentityKey(
  userId: string,
  identityKeyBase64: string
): Promise<VerificationStatus> {
  const existing = await getKnownIdentityKey(userId);

  if (!existing) {
    // First time — store and mark as unverified
    await storeKnownIdentityKey(userId, identityKeyBase64, 'unverified');
    log.encryption.debug(`First identity key stored for user ${userId}`);
    return 'unverified';
  }

  if (existing.identityKey === identityKeyBase64) {
    // Same key — return current status
    return existing.verificationStatus;
  }

  // Key changed — update and warn
  await storeKnownIdentityKey(userId, identityKeyBase64, 'key_changed');
  log.encryption.warn(`Identity key changed for user ${userId}`);
  return 'key_changed';
}

/**
 * Mark a contact as verified (user confirmed safety number match)
 */
export async function markAsVerified(userId: string): Promise<void> {
  await dbSetVerificationStatus(userId, 'verified');
  log.encryption.info(`User ${userId} marked as verified`);
}

/**
 * Mark a contact as unverified
 */
export async function markAsUnverified(userId: string): Promise<void> {
  await dbSetVerificationStatus(userId, 'unverified');
  log.encryption.info(`User ${userId} marked as unverified`);
}

/**
 * Get the safety number for the current user and a contact.
 * Returns formatted safety number (12 groups of 5 digits).
 */
export async function getSafetyNumber(
  theirIdentityKeyBase64: string
): Promise<{ raw: string; formatted: string } | null> {
  const ourKey = await getLocalIdentityKey();
  if (!ourKey) return null;

  const theirKey = fromBase64(theirIdentityKeyBase64);
  const raw = generateSafetyNumber(ourKey.publicKey, theirKey);

  // Format as 12 groups of 5 digits
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += 5) {
    groups.push(raw.slice(i, i + 5));
  }
  const formatted = groups.join(' ');

  return { raw, formatted };
}

/**
 * Get the verification status of a contact
 */
export async function getVerificationStatus(
  userId: string
): Promise<VerificationStatus | null> {
  const known = await getKnownIdentityKey(userId);
  return known?.verificationStatus ?? null;
}

export const verificationService = {
  checkIdentityKey,
  markAsVerified,
  markAsUnverified,
  getSafetyNumber,
  getVerificationStatus,
};

export default verificationService;
