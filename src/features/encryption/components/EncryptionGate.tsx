'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEncryptionStore } from '../stores/keyStore';
import { KeyBackupDialog } from './KeyBackupDialog';
import { queryKeys } from '@/lib/queryClient';
import { log } from '@/lib/logger';
import toast from 'react-hot-toast';

/**
 * EncryptionGate — App-level E2EE gating (Messenger pattern).
 *
 * Two responsibilities:
 * 1. RESTORE: When 'needs_restore' (no local keys but server backup exists),
 *    show a blocking PIN dialog so the user restores keys immediately on login.
 *
 * 2. BACKUP ONBOARDING: When 'ready' but no backup exists (brand-new user or
 *    user who never backed up), prompt to create a backup right after login —
 *    not deferred until first chat open. Non-dismissable (same as restore) so
 *    users cannot skip it and lose message history on their next device.
 */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const encryptionInitStatus = useEncryptionStore((s) => s.initStatus);
  const hasBackup = useEncryptionStore((s) => s.hasBackup);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [backupType, setBackupType] = useState<'pin' | 'sso' | null>(null);
  const backupPromptShownRef = useRef(false);

  // Blocking restore: fire immediately when needs_restore; fetch backup type for UI
  useEffect(() => {
    if (encryptionInitStatus === 'needs_restore') {
      setShowRestoreDialog(true);
      import('@/features/encryption/services/backupService')
        .then(({ getBackupStatus }) => getBackupStatus())
        .then((status) => setBackupType(status.backup_type ?? null))
        .catch(() => {});
    }
    // Surface E2EE init failures as a non-blocking dismissable banner
    if (encryptionInitStatus === 'error') {
      setShowErrorBanner(true);
    } else {
      setShowErrorBanner(false);
    }
  }, [encryptionInitStatus]);

  // Backup onboarding: fire once after E2EE is ready and no backup exists
  // 2-second delay so the app layout renders before the modal appears
  useEffect(() => {
    if (
      encryptionInitStatus === 'ready' &&
      hasBackup === false &&
      !backupPromptShownRef.current
    ) {
      backupPromptShownRef.current = true;
      const timer = setTimeout(() => setShowBackupPrompt(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [encryptionInitStatus, hasBackup]);

  const handleRestoreComplete = async () => {
    setShowRestoreDialog(false);
    try {
      // Use reinitialize (not initialize) — initialize() short-circuits when initStatus='ready',
      // which it already is from the pre-restore init. reinitialize() resets the status first
      // so the restored identity keys are fully loaded and session recovery works.
      const { reinitializeEncryption } = await import('@/features/encryption');
      await reinitializeEncryption();
      log.encryption.info('E2EE restored from backup — all conversations now decryptable');
    } catch (err) {
      log.encryption.error('Failed to re-initialize after restore:', err);
      // Inform the user so they know to refresh rather than wondering why messages
      // are still showing "[Unable to decrypt message]" placeholders.
      toast.error(
        'Session restore failed. Your keys were restored but messages may not decrypt. Please refresh the page.',
        { duration: 8000 }
      );
    }

    // Clear decryption failure/content caches and invalidate message queries
    // so any messages opened before restore are re-fetched and re-decrypted.
    const { clearFailedDecryptions } = await import('@/features/messaging/hooks/useMessagesQuery');
    const { decryptedContentCache } = await import('@/features/messaging/hooks/useMessages');
    clearFailedDecryptions();
    decryptedContentCache.clear();

    // Also clear the IndexedDB persistent plaintext cache. On a same-device restore
    // (e.g. PIN update via Settings → Security), old decrypted content cached in
    // IndexedDB would be served without re-decryption, bypassing the fresh session keys.
    // On a fresh device this store is empty, so the clear is a cheap no-op.
    try {
      const { clearDecryptedMessages } = await import('@/features/encryption/db/cryptoDb');
      await clearDecryptedMessages();
    } catch {
      log.encryption.warn('Failed to clear IndexedDB decrypted messages cache after restore');
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });

    useEncryptionStore.getState().setHasBackup(true);
  };

  const handleBackupComplete = async () => {
    setShowBackupPrompt(false);
    useEncryptionStore.getState().setHasBackup(true);
  };

  const handleRetryInit = useCallback(async () => {
    try {
      const { encryptionService } = await import('@/features/encryption');
      await encryptionService.initialize();
    } catch (err) {
      log.encryption.error('E2EE retry init failed:', err);
    }
  }, []);

  return (
    <>
      {children}

      {/* Non-blocking banner when E2EE init fails — lets user retry without a hard refresh */}
      {showErrorBanner && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 shadow-lg"
        >
          <span>
            End-to-end encryption could not start. Messages may not be encrypted.
          </span>
          <button
            onClick={handleRetryInit}
            className="ml-2 rounded bg-yellow-200 px-3 py-1 text-xs font-medium text-yellow-900 hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            Retry
          </button>
          <button
            onClick={() => setShowErrorBanner(false)}
            aria-label="Dismiss"
            className="ml-1 text-yellow-700 hover:text-yellow-900 focus:outline-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* Restore keys on new device — closeable but warns before dismissal */}
      <KeyBackupDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        mode="restore"
        disableClose={false}
        onComplete={handleRestoreComplete}
        backupType={backupType}
      />

      {/* Blocking: prompt new users to create a backup right after login.
          disableClose=true prevents dismissal — users must create a backup
          so they can recover their keys on a new device. */}
      <KeyBackupDialog
        open={showBackupPrompt}
        onOpenChange={setShowBackupPrompt}
        mode="backup"
        disableClose={true}
        onComplete={handleBackupComplete}
        backupType={backupType}
      />
    </>
  );
}
