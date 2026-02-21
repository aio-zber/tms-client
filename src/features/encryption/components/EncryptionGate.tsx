'use client';

import { useEffect, useState, useRef } from 'react';
import { useEncryptionStore } from '../stores/keyStore';
import { KeyBackupDialog } from './KeyBackupDialog';
import { log } from '@/lib/logger';

/**
 * EncryptionGate — App-level E2EE gating (Messenger pattern).
 *
 * Two responsibilities:
 * 1. RESTORE: When 'needs_restore' (no local keys but server backup exists),
 *    show a blocking PIN dialog so the user restores keys immediately on login.
 *
 * 2. BACKUP ONBOARDING: When 'ready' but no backup exists (brand-new user or
 *    user who never backed up), prompt to create a backup right after login —
 *    not deferred until first chat open. Dismissable (unlike restore).
 */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
  const encryptionInitStatus = useEncryptionStore((s) => s.initStatus);
  const hasBackup = useEncryptionStore((s) => s.hasBackup);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const backupPromptShownRef = useRef(false);

  // Blocking restore: fire immediately when needs_restore
  useEffect(() => {
    if (encryptionInitStatus === 'needs_restore') {
      setShowRestoreDialog(true);
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
      const { encryptionService } = await import('@/features/encryption');
      await encryptionService.initialize();
      log.encryption.info('E2EE restored from backup — all conversations now decryptable');
    } catch (err) {
      log.encryption.error('Failed to re-initialize after restore:', err);
    }
    useEncryptionStore.getState().setHasBackup(true);
  };

  const handleBackupComplete = () => {
    setShowBackupPrompt(false);
    useEncryptionStore.getState().setHasBackup(true);
  };

  return (
    <>
      {children}

      {/* Blocking: restore keys on new device */}
      <KeyBackupDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        mode="restore"
        disableClose={encryptionInitStatus === 'needs_restore'}
        onComplete={handleRestoreComplete}
      />

      {/* Non-blocking: prompt new users to create a backup right after login */}
      <KeyBackupDialog
        open={showBackupPrompt}
        onOpenChange={setShowBackupPrompt}
        mode="backup"
        onComplete={handleBackupComplete}
      />
    </>
  );
}
