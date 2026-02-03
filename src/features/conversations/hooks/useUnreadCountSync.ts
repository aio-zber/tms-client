/**
 * useUnreadCountSync Hook
 * Syncs unread counts with WebSocket events for real-time updates
 */

import { log } from '@/lib/logger';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook to sync unread counts via WebSocket
 * Invalidates unread count queries when messages are marked as read
 */
export function useUnreadCountSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket) {
      log.message.warn('[useUnreadCountSync] Socket not initialized');
      return;
    }

    // Listen for message_read events
    const handleMessageRead = (data: Record<string, unknown>) => {
      log.message.debug('[useUnreadCountSync] Message read event received:', data);

      const conversationId = data.conversation_id as string;

      if (conversationId) {
        // Invalidate specific conversation unread count
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
      }

      // Always invalidate total unread count
      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.total(),
      });
    };

    // Listen for new_message events (increment count)
    const handleNewMessage = (data: Record<string, unknown>) => {
      log.message.debug('[useUnreadCountSync] New message event received:', data);

      const conversationId = data.conversation_id as string;

      if (conversationId) {
        // Invalidate specific conversation unread count
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
      }

      // Invalidate total unread count
      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.total(),
      });
    };

    // Listen for message_status events (Telegram/Messenger pattern)
    const handleMessageStatus = (data: Record<string, unknown>) => {
      log.message.debug('[useUnreadCountSync] Message status event received:', data);

      const { status, conversation_id } = data as {
        status: string;
        conversation_id?: string;
        user_id?: string;
      };

      // If message is marked as READ, decrement unread count
      if (status === 'READ' || status === 'read') {
        log.message.debug('[useUnreadCountSync] Message marked as READ - updating unread counts');

        // Optimistically decrement unread count for this conversation
        if (conversation_id) {
          queryClient.setQueryData(
            queryKeys.unreadCount.conversation(conversation_id),
            (old: unknown) => {
              if (!old || typeof old !== 'object') return old;
              const oldData = old as { unread_count?: number };
              const currentCount = oldData.unread_count ?? 0;
              return {
                ...oldData,
                unread_count: Math.max(0, currentCount - 1), // Don't go below 0
              };
            }
          );

          // Invalidate to refetch accurate count
          queryClient.invalidateQueries({
            queryKey: queryKeys.unreadCount.conversation(conversation_id),
          });
        }

        // Optimistically decrement total unread count
        queryClient.setQueryData(
          queryKeys.unreadCount.total(),
          (old: unknown) => {
            if (!old || typeof old !== 'object') return old;
            const oldData = old as { total_unread_count?: number };
            const currentTotal = oldData.total_unread_count ?? 0;
            return {
              ...oldData,
              total_unread_count: Math.max(0, currentTotal - 1), // Don't go below 0
            };
          }
        );

        // Invalidate total unread count to refetch
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }
    };

    // Register listeners
    socketClient.onMessageRead(handleMessageRead);
    socketClient.onNewMessage(handleNewMessage);
    socketClient.onMessageStatus(handleMessageStatus);

    // Cleanup
    return () => {
      socketClient.off('message_read', handleMessageRead);
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_status', handleMessageStatus);
    };
  }, [queryClient]);
}
