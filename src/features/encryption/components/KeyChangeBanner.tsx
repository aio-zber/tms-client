/**
 * Key Change Banner
 * Warning shown in chat when a contact's identity key has changed
 */

'use client';

import { ShieldAlert, X } from 'lucide-react';

interface KeyChangeBannerProps {
  userName: string;
  onDismiss: () => void;
  onViewSecurity: () => void;
}

export function KeyChangeBanner({
  userName,
  onDismiss,
  onViewSecurity,
}: KeyChangeBannerProps) {
  return (
    <div className="mx-3 mt-2 flex items-center gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
      <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {userName}&apos;s security key has changed.{' '}
          <button
            onClick={onViewSecurity}
            className="font-medium underline hover:no-underline"
          >
            Verify identity
          </button>
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default KeyChangeBanner;
