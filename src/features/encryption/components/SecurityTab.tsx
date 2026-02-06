/**
 * Security Tab
 * Displays safety number, QR code, and verification status
 * Used inside ConversationSettingsDialog
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SafetyNumberQR } from './SafetyNumberQR';
import toast from 'react-hot-toast';
import type { Conversation } from '@/types/conversation';
import type { VerificationStatus } from '../types';

interface SecurityTabProps {
  conversation: Conversation;
  currentUserId: string;
}

interface SafetyNumberData {
  raw: string;
  formatted: string;
}

export function SecurityTab({ conversation, currentUserId }: SecurityTabProps) {
  const [safetyNumber, setSafetyNumber] = useState<SafetyNumberData | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [theirIdentityKey, setTheirIdentityKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const isDM = conversation.type === 'dm';
  const otherMember = isDM
    ? conversation.members.find((m) => m.userId !== currentUserId)
    : null;
  const otherUserId = otherMember?.userId;
  const otherUserName = otherMember?.user?.name || 'Unknown';

  const loadSecurityInfo = useCallback(async () => {
    if (!isDM || !otherUserId) {
      setLoading(false);
      return;
    }

    try {
      const [{ getKnownIdentityKey }, { getSafetyNumber, getVerificationStatus }] =
        await Promise.all([
          import('../db/cryptoDb'),
          import('../services/verificationService'),
        ]);

      // Get known identity key
      const knownKey = await getKnownIdentityKey(otherUserId);
      if (knownKey) {
        setTheirIdentityKey(knownKey.identityKey);

        // Get safety number
        const sn = await getSafetyNumber(knownKey.identityKey);
        setSafetyNumber(sn);

        // Get verification status
        const status = await getVerificationStatus(otherUserId);
        setVerificationStatus(status);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [isDM, otherUserId]);

  useEffect(() => {
    loadSecurityInfo();
  }, [loadSecurityInfo]);

  const handleToggleVerification = async () => {
    if (!otherUserId) return;

    setVerifying(true);
    try {
      const { markAsVerified, markAsUnverified } = await import(
        '../services/verificationService'
      );

      if (verificationStatus === 'verified') {
        await markAsUnverified(otherUserId);
        setVerificationStatus('unverified');
        toast.success('Marked as unverified');
      } else {
        await markAsVerified(otherUserId);
        setVerificationStatus('verified');
        toast.success('Marked as verified');
      }
    } catch {
      toast.error('Failed to update verification status');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-viber-purple" />
      </div>
    );
  }

  // Group conversation
  if (!isDM) {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-viber-purple" />
          <div>
            <h3 className="font-medium">End-to-End Encryption</h3>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
              Messages in this group are end-to-end encrypted. Only members can read them.
            </p>
          </div>
        </div>
        <div className="text-sm text-gray-500 dark:text-dark-text-secondary">
          <p>{conversation.members.length} member{conversation.members.length !== 1 ? 's' : ''} in this group</p>
        </div>
      </div>
    );
  }

  // No security info yet
  if (!theirIdentityKey || !safetyNumber) {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-gray-400" />
          <div>
            <h3 className="font-medium">End-to-End Encryption</h3>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
              Security information will be available after the first encrypted message exchange.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // DM with safety number
  const StatusIcon =
    verificationStatus === 'verified'
      ? ShieldCheck
      : verificationStatus === 'key_changed'
        ? ShieldAlert
        : Shield;

  const statusColor =
    verificationStatus === 'verified'
      ? 'text-green-600 dark:text-green-400'
      : verificationStatus === 'key_changed'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-viber-purple';

  const statusLabel =
    verificationStatus === 'verified'
      ? 'Verified'
      : verificationStatus === 'key_changed'
        ? 'Security Key Changed'
        : 'Not Verified';

  return (
    <div className="space-y-6 py-4">
      {/* Status */}
      <div className="flex items-center gap-3">
        <StatusIcon className={`w-8 h-8 ${statusColor}`} />
        <div>
          <h3 className="font-medium">{statusLabel}</h3>
          <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
            {verificationStatus === 'verified'
              ? `You have verified ${otherUserName}'s identity.`
              : verificationStatus === 'key_changed'
                ? `${otherUserName}'s security key has changed. Verify their identity.`
                : `Compare the safety number below with ${otherUserName} to verify.`}
          </p>
        </div>
      </div>

      {/* Key Changed Warning */}
      {verificationStatus === 'key_changed' && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This could mean {otherUserName} reinstalled the app, got a new device,
            or — in rare cases — someone is intercepting the connection.
            Contact them through another channel to verify.
          </p>
        </div>
      )}

      {/* Safety Number Grid */}
      <div>
        <h4 className="text-sm font-medium mb-3">Safety Number</h4>
        <div className="grid grid-cols-4 gap-x-6 gap-y-2 text-center font-mono text-base bg-gray-50 dark:bg-dark-bg rounded-lg p-4">
          {safetyNumber.formatted.split(' ').map((group, i) => (
            <span key={i} className="text-gray-700 dark:text-dark-text">
              {group}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-dark-text-secondary mt-2">
          If this number matches on both devices, your conversation is secure.
        </p>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-2">
        <h4 className="text-sm font-medium">Scan to Verify</h4>
        <SafetyNumberQR safetyNumber={safetyNumber.raw} size={180} />
        <p className="text-xs text-gray-400 dark:text-dark-text-secondary">
          Scan this code with {otherUserName}&apos;s device
        </p>
      </div>

      {/* Verify/Unverify Button */}
      <Button
        onClick={handleToggleVerification}
        disabled={verifying}
        variant={verificationStatus === 'verified' ? 'outline' : 'default'}
        className={
          verificationStatus === 'verified'
            ? 'w-full'
            : 'w-full bg-viber-purple hover:bg-viber-purple-dark text-white'
        }
      >
        {verifying ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : verificationStatus === 'verified' ? (
          <ShieldCheck className="w-4 h-4 mr-2" />
        ) : (
          <Shield className="w-4 h-4 mr-2" />
        )}
        {verificationStatus === 'verified' ? 'Mark as Unverified' : 'Mark as Verified'}
      </Button>
    </div>
  );
}

export default SecurityTab;
