/**
 * NotificationBadge Component
 * Displays unread notification count badge
 * Pattern: Uses existing badge.tsx component
 */

'use client';

import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  onClick?: () => void;
  className?: string;
}

export function NotificationBadge({ onClick, className }: NotificationBadgeProps) {
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const hasUnread = unreadCount > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border transition-colors',
        className
      )}
      aria-label={`Notifications ${hasUnread ? `(${unreadCount} unread)` : ''}`}
    >
      <Bell className="w-5 h-5 text-gray-700 dark:text-dark-text" />

      {hasUnread && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-viber-purple text-white text-xs font-semibold">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
