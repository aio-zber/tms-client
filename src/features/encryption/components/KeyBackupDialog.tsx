/**
 * Key Backup Dialog
 *
 * Three modes:
 * - 'backup'  — create/update a PIN-protected backup (two-step PIN confirmation)
 * - 'restore' — enter PIN to restore keys from server backup
 * - 'manage'  — unified view with tab switcher (backup + restore in one dialog)
 *
 * Viber-style: 6-digit PIN with show/hide toggle, loading during Argon2id KDF
 */

'use client';

import { useState, useCallback } from 'react';
import { Eye, EyeOff, Shield, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { PIN_LENGTH } from '../constants';

interface KeyBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'backup' | 'restore' | 'manage' (unified tab view) */
  mode: 'backup' | 'restore' | 'manage';
  onComplete: () => void;
  /** When true the dialog cannot be dismissed (used by EncryptionGate for forced restore) */
  disableClose?: boolean;
  /** Pre-select which tab opens in 'manage' mode. Defaults to 'backup'. */
  hasExistingBackup?: boolean;
}

export function KeyBackupDialog({
  open,
  onOpenChange,
  mode,
  onComplete,
  disableClose = false,
  hasExistingBackup = false,
}: KeyBackupDialogProps) {
  // In 'manage' mode, allow switching between backup and restore tabs
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>(
    mode === 'restore' ? 'restore' : 'backup'
  );

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');

  // Effective mode: in 'manage' mode use the active tab
  const effectiveMode = mode === 'manage' ? activeTab : mode;
  const isBackup = effectiveMode === 'backup';
  const isPinValid = pin.length === PIN_LENGTH && /^\d+$/.test(pin);
  const pinsMatch = pin === confirmPin;

  const resetState = useCallback(() => {
    setPin('');
    setConfirmPin('');
    setShowPin(false);
    setLoading(false);
    setStep('enter');
  }, []);

  // When switching tabs in manage mode, reset form state
  const switchTab = (tab: 'backup' | 'restore') => {
    resetState();
    setActiveTab(tab);
  };

  const handlePinChange = (value: string, field: 'pin' | 'confirm') => {
    const cleaned = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (field === 'pin') setPin(cleaned);
    else setConfirmPin(cleaned);
  };

  const handleSubmit = async () => {
    if (!isPinValid) return;

    if (isBackup && step === 'enter') {
      setStep('confirm');
      return;
    }

    if (isBackup && !pinsMatch) {
      toast.error('PINs do not match');
      setConfirmPin('');
      return;
    }

    setLoading(true);
    try {
      const { createKeyBackup, restoreKeyBackup } = await import(
        '../services/backupService'
      );

      if (isBackup) {
        await createKeyBackup(pin);
        toast.success('Key backup created successfully');
      } else {
        await restoreKeyBackup(pin);
        toast.success('Keys restored successfully');
      }

      resetState();
      onComplete();
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Operation failed';
      if (msg.includes('Invalid PIN') || msg.includes('INVALID_PIN')) {
        toast.error('Invalid PIN or corrupted backup');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && disableClose) return;
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  const isManage = mode === 'manage';

  const title = isManage
    ? 'Encryption Keys'
    : isBackup
      ? 'Back Up Encryption Keys'
      : 'Restore Encryption Keys';

  const description = isManage
    ? 'Back up your keys to keep them safe, or restore keys you backed up previously.'
    : isBackup
      ? "Create a PIN to protect your encryption keys. You'll need this PIN to restore keys on a new device."
      : 'Enter the PIN you used when backing up your encryption keys.';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-viber-purple" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Tab switcher — only in 'manage' mode */}
        {isManage && (
          <div className="flex border-b dark:border-dark-border -mx-1">
            <button
              onClick={() => switchTab('backup')}
              className={`flex-1 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'backup'
                  ? 'border-viber-purple text-viber-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-dark-text-primary'
              }`}
            >
              {hasExistingBackup ? 'Update Backup' : 'Back Up Keys'}
            </button>
            {hasExistingBackup && (
              <button
                onClick={() => switchTab('restore')}
                className={`flex-1 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === 'restore'
                    ? 'border-viber-purple text-viber-purple'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-dark-text-primary'
                }`}
              >
                Restore Keys
              </button>
            )}
          </div>
        )}

        <div className="space-y-4 pt-2">
          {/* PIN Input */}
          <div className="space-y-2">
            <Label htmlFor="backup-pin">
              {step === 'confirm' ? 'Confirm PIN' : `${PIN_LENGTH}-Digit PIN`}
            </Label>
            <div className="relative">
              <Input
                id="backup-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={PIN_LENGTH}
                placeholder={'0'.repeat(PIN_LENGTH)}
                value={step === 'confirm' ? confirmPin : pin}
                onChange={(e) =>
                  handlePinChange(e.target.value, step === 'confirm' ? 'confirm' : 'pin')
                }
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                disabled={loading}
                className="pr-10 text-center text-lg tracking-[0.5em] font-mono"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {step === 'enter' && isBackup && (
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                Choose a PIN you can remember. If you lose this PIN, you cannot recover your keys.
              </p>
            )}
            {step === 'confirm' && (
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                Re-enter your PIN to confirm.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {step === 'confirm' && (
              <Button
                variant="outline"
                onClick={() => { setStep('enter'); setConfirmPin(''); }}
                disabled={loading}
                className="flex-1"
              >
                Back
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              disabled={loading || !isPinValid || (step === 'confirm' && !pinsMatch)}
              className="flex-1 bg-viber-purple hover:bg-viber-purple-dark text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isBackup ? 'Encrypting...' : 'Decrypting...'}
                </>
              ) : isBackup ? (
                step === 'enter' ? 'Next' : (hasExistingBackup ? 'Update Backup' : 'Create Backup')
              ) : (
                'Restore Keys'
              )}
            </Button>
          </div>

          <p className="text-xs text-center text-gray-400 dark:text-dark-text-secondary">
            Your PIN is never sent to the server.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyBackupDialog;
