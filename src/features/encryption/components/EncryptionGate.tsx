'use client';

import { useEffect, useState } from 'react';
import { useEncryptionStore } from '../stores/keyStore';
import { KeyBackupDialog } from './KeyBackupDialog';
import { log } from '@/lib/logger';

/**
 * EncryptionGate — App-level PIN restore overlay (Messenger pattern).
 *
 * Wraps the main layout. When encryption status is 'needs_restore'
 * (local keys missing but server backup exists), shows a blocking
 * KeyBackupDialog so the user enters their PIN **once** at login.
 * After restore, re-initializes encryption and all conversations
 * become decryptable.
 */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
  const encryptionInitStatus = useEncryptionStore((s) => s.initStatus);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  useEffect(() => {
    if (encryptionInitStatus === 'needs_restore') {
      setShowRestoreDialog(true);
    }
  }, [encryptionInitStatus]);

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

  return (
    <>
      {children}
      <KeyBackupDialog
        open={showRestoreDialog}
        onOpenChange={(open) => {
          // Don't allow dismissing the restore dialog — user must enter PIN
          if (!open && encryptionInitStatus === 'needs_restore') {
            return;
          }
          setShowRestoreDialog(open);
        }}
        mode="restore"
        onComplete={handleRestoreComplete}
      />
    </>
  );
}
