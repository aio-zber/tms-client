/**
 * Key Backup Dialog
 *
 * Three modes:
 * - 'backup'  — create/update a PIN-protected backup
 * - 'restore' — enter PIN to restore keys from server backup
 * - 'manage'  — unified view with tab switcher (backup + restore in one dialog)
 *
 * Backup flow: verify account password → enter PIN → confirm PIN → encrypt + upload
 * Restore flow: enter PIN → decrypt (PIN itself proves identity)
 *
 * Viber-style: 6-digit PIN with show/hide toggle, loading during Argon2id KDF
 */

'use client';

import { useState, useCallback } from 'react';
import { Eye, EyeOff, Shield, Loader2, AlertTriangle } from 'lucide-react';
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
import { STORAGE_KEYS, getApiBaseUrl } from '@/lib/constants';

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

type Step = 'verify_password' | 'enter' | 'confirm';

async function verifyAccountPassword(password: string): Promise<void> {
  // Get user email from stored user data or /users/me
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || getApiBaseUrl();
  const jwtToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

  // Fetch email from /users/me
  const meRes = await fetch(`${apiBaseUrl}/users/me`, {
    headers: { Authorization: `Bearer ${jwtToken}` },
  });
  if (!meRes.ok) throw new Error('Could not retrieve account info');
  const me = await meRes.json();
  const email: string = me.email;

  const res = await fetch(`${apiBaseUrl}/auth/verify-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 401) {
    throw new Error('Incorrect password');
  }
  if (!res.ok) {
    throw new Error('Verification failed. Please try again.');
  }
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

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPinConfirmModal, setShowPinConfirmModal] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  // Backup starts with password verification; restore goes straight to PIN entry
  const [step, setStep] = useState<Step>(
    mode === 'restore' ? 'enter' : 'verify_password'
  );

  // Effective mode: in 'manage' mode use the active tab
  const effectiveMode = mode === 'manage' ? activeTab : mode;
  const isBackup = effectiveMode === 'backup';
  const isPinValid = pin.length === PIN_LENGTH && /^\d+$/.test(pin);
  const pinsMatch = pin === confirmPin;

  const resetState = useCallback(() => {
    setPassword('');
    setShowPassword(false);
    setPin('');
    setConfirmPin('');
    setShowPin(false);
    setLoading(false);
    // Backup starts at password verification; restore starts at PIN entry
    setStep(isBackup ? 'verify_password' : 'enter');
  }, [isBackup]);

  // When switching tabs in manage mode, reset form state
  const switchTab = (tab: 'backup' | 'restore') => {
    setPassword('');
    setShowPassword(false);
    setPin('');
    setConfirmPin('');
    setShowPin(false);
    setLoading(false);
    setStep(tab === 'backup' ? 'verify_password' : 'enter');
    setActiveTab(tab);
  };

  const handlePinChange = (value: string, field: 'pin' | 'confirm') => {
    const cleaned = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (field === 'pin') setPin(cleaned);
    else setConfirmPin(cleaned);
  };

  const handlePasswordSubmit = async () => {
    if (!password) return;
    setLoading(true);
    try {
      await verifyAccountPassword(password);
      setStep('enter');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Verification failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (step === 'verify_password') {
      await handlePasswordSubmit();
      return;
    }

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

    // Show confirmation modal before final backup submit
    if (isBackup && step === 'confirm') {
      setShowPinConfirmModal(true);
      return;
    }

    setLoading(true);
    await executeBackupRestore();
  };

  const executeBackupRestore = async () => {
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
    if (!isOpen) {
      // Hard block for backup (new users must create a backup)
      if (disableClose && isBackup) return;
      // Restore: always warn before closing so users know they can recover later
      if (!isBackup) {
        setShowCloseWarning(true);
        return;
      }
      resetState();
    }
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
          {/* Step 1 (backup only): verify account password */}
          {isBackup && step === 'verify_password' ? (
            <div className="space-y-2">
              <Label htmlFor="account-password">Account Password</Label>
              <div className="relative">
                <Input
                  id="account-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                  disabled={loading}
                  className="pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  <span className="font-semibold">Important:</span> The PIN you are about to create cannot be recovered. If you forget it, you will need to generate a new one — but your old encrypted messages will no longer be decryptable.
                </p>
              </div>
            </div>
          ) : (
            /* Steps 2–3: PIN entry (backup) or PIN entry (restore) */
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
              {step === 'enter' && !isBackup && (
                <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                  Forgot your PIN? You can only recover it from a device where you are already logged in (Settings → Security → Update Backup). If you no longer have access to that device, you will need to generate a new PIN — but past messages will not be decryptable.
                </p>
              )}
              {step === 'enter' && isBackup && (
                <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <span className="font-semibold">This PIN cannot be recovered.</span> If you forget it, you will need to generate a new PIN — but this will permanently prevent you from decrypting your old messages.
                  </p>
                </div>
              )}
              {step === 'confirm' && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Remember this PIN. It cannot be reset without losing access to past messages.
                </p>
              )}
            </div>
          )}

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
            {step === 'enter' && isBackup && (
              <Button
                variant="outline"
                onClick={() => setStep('verify_password')}
                disabled={loading}
                className="flex-1"
              >
                Back
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              disabled={
                loading ||
                (step === 'verify_password' && !password) ||
                (step !== 'verify_password' && !isPinValid) ||
                (step === 'confirm' && !pinsMatch)
              }
              className="flex-1 bg-viber-purple hover:bg-viber-purple-dark text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {step === 'verify_password' ? 'Verifying...' : isBackup ? 'Encrypting...' : 'Decrypting...'}
                </>
              ) : step === 'verify_password' ? (
                'Verify'
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

    {/* Confirm before final PIN backup submit */}
    <Dialog open={showPinConfirmModal} onOpenChange={setShowPinConfirmModal}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Are you sure you remember this PIN?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-gray-600 dark:text-dark-text-secondary pt-1">
              <p>
                This PIN is the <strong className="text-gray-900 dark:text-dark-text-primary">only way</strong> to restore your encrypted messages on a new device or browser.
              </p>
              <p className="text-amber-700 dark:text-amber-400 font-medium">
                If you forget it, your old messages will be permanently unreadable — there is no way to recover this PIN.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={() => setShowPinConfirmModal(false)}>
            Go Back
          </Button>
          <Button
            className="flex-1 bg-viber-purple hover:bg-viber-purple-dark text-white"
            onClick={() => {
              setShowPinConfirmModal(false);
              executeBackupRestore();
            }}
          >
            Yes, I Remember
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Warn before closing the restore dialog without restoring */}
    <Dialog open={showCloseWarning} onOpenChange={setShowCloseWarning}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Skip key restore?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-gray-600 dark:text-dark-text-secondary pt-1">
              <p>
                Without restoring your keys, your <strong className="text-gray-900 dark:text-dark-text-primary">old messages will not be readable</strong> on this device.
              </p>
              <p>
                You can still recover them — go to <strong className="text-gray-900 dark:text-dark-text-primary">Settings → Security → Restore Keys</strong> and enter your PIN. After restoring, <strong className="text-gray-900 dark:text-dark-text-primary">refresh the page</strong> (or hard refresh with Ctrl+Shift+R / Cmd+Shift+R if messages still don&apos;t appear).
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={() => setShowCloseWarning(false)}>
            Enter My PIN Now
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => {
              setShowCloseWarning(false);
              resetState();
              onOpenChange(false);
            }}
          >
            Skip for Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyBackupDialog;
