/**
 * NotificationCenter Component
 * Slide-in drawer showing notification history
 * Pattern: Uses Dialog component with slide-in animation
 */

'use client';

import { useRouter } from 'next/navigation';
import { useNotificationStore } from '@/store/notificationStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Check, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export function NotificationCenter() {
  const router = useRouter();
  const isOpen = useNotificationStore((state) => state.isNotificationCenterOpen);
  const setOpen = useNotificationStore((state) => state.setNotificationCenterOpen);
  const notifications = useNotificationStore((state) => state.notifications);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const clearAll = useNotificationStore((state) => state.clearAll);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  const handleNotificationClick = (conversationId: string, notificationId: string) => {
    markAsRead(notificationId);
    router.push(`/chat/${conversationId}`);
    setOpen(false);
  };

  const getInitials = (name?: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getNotificationIcon = (type: string, emoji?: string) => {
    switch (type) {
      case 'mention':
        return '📢';
      case 'reaction':
        return emoji || '❤️';
      case 'member_activity':
        return '👥';
      case 'conversation_update':
        return '⚙️';
      default:
        return '💬';
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md max-h-[80vh] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({unreadCount} unread)
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="text-xs"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Mark all read
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear all
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Notification List */}
        <ScrollArea className="flex-1 max-h-[calc(80vh-120px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <X className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                No notifications
              </h3>
              <p className="text-sm text-gray-500">
                You&apos;re all caught up!
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    'px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors',
                    !notification.isRead && 'bg-viber-purple-bg/30'
                  )}
                  onClick={() =>
                    handleNotificationClick(notification.conversationId, notification.id)
                  }
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarImage
                        src={notification.senderAvatar}
                        alt={notification.senderName}
                      />
                      <AvatarFallback className="bg-viber-purple text-white text-sm">
                        {getInitials(notification.senderName)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {notification.senderName || 'Unknown'}
                        </span>
                        <span className="text-lg leading-none">
                          {getNotificationIcon(
                            notification.type,
                            notification.metadata?.emoji
                          )}
                        </span>
                        {!notification.isRead && (
                          <div className="w-2 h-2 bg-viber-purple rounded-full flex-shrink-0" />
                        )}
                      </div>

                      <p className="text-sm text-gray-700 line-clamp-2 mb-1">
                        {notification.content || 'New notification'}
                      </p>

                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{notification.conversationName || 'Unknown conversation'}</span>
                        <span>•</span>
                        <span>
                          {formatDistanceToNow(new Date(notification.timestamp), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNotification(notification.id);
                      }}
                      className="p-1 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
                      aria-label="Remove notification"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
