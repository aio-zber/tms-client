/**
 * NotificationToast Component
 * Custom toast component for notifications with Viber styling
 * Pattern: Follows MessageBubble.tsx for avatar + content layout
 */

'use client';

import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNotificationStore } from '@/store/notificationStore';
import type { Notification } from '../types';

interface NotificationToastProps {
  notification: Notification;
  toastId: string;
}

export function NotificationToast({ notification, toastId: _toastId }: NotificationToastProps) {
  const router = useRouter();
  const markAsRead = useNotificationStore((state) => state.markAsRead);

  const handleClick = () => {
    // Mark as read
    markAsRead(notification.id);

    // Navigate to conversation
    router.push(`/chat/${notification.conversationId}`);

    // Toast will auto-dismiss via react-hot-toast
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get notification icon based on type
  const getNotificationIcon = () => {
    switch (notification.type) {
      case 'mention':
        return '📢';
      case 'reaction':
        return notification.metadata?.emoji || '❤️';
      case 'member_activity':
        return '👥';
      case 'conversation_update':
        return '⚙️';
      default:
        return '💬';
    }
  };

  return (
    <div
      onClick={handleClick}
      className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors max-w-sm"
    >
      {/* Avatar */}
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage src={notification.senderAvatar} alt={notification.senderName} />
        <AvatarFallback className="bg-viber-purple text-white text-sm">
          {getInitials(notification.senderName)}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {notification.senderName}
          </span>
          <span className="text-lg leading-none">{getNotificationIcon()}</span>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {notification.content}
        </p>

        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          {notification.conversationName}
        </p>
      </div>

      {/* Priority indicator */}
      {notification.priority === 'high' && (
        <div className="w-2 h-2 bg-viber-purple rounded-full flex-shrink-0 mt-2" />
      )}
    </div>
  );
}
