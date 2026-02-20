/**
 * useUnreadCountSync Hook
 * Syncs unread counts with WebSocket events for real-time updates.
 *
 * Only invalidates on read events — increment is handled by useConversations
 * (which also manages the conversation list cache). Having two listeners for
 * new_message that both invalidate unread count queries caused cascading
 * double-refetches and inflated counts.
 */

import { log } from '@/lib/logger';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { queryKeys } from '@/lib/queryClient';

/**
 * Hook to sync unread counts via WebSocket.
 * Listens for message_read and message_status(read) events and invalidates
 * the unread count queries so the server's accurate count is fetched.
 */
export function useUnreadCountSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket) {
      log.message.warn('[useUnreadCountSync] Socket not initialized');
      return;
    }

    // Listen for message_read events (explicit read receipts)
    const handleMessageRead = (data: Record<string, unknown>) => {
      log.message.debug('[useUnreadCountSync] Message read event received:', data);

      const conversationId = data.conversation_id as string;

      if (conversationId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
      }

      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.total(),
      });
    };

    // Listen for message_status events — reset to 0 on READ (Telegram/Messenger pattern).
    // Do NOT decrement by 1 per event: mark-as-read is a batch operation and the server
    // returns the accurate count after last_read_at. Just invalidate and let it refetch.
    const handleMessageStatus = (data: Record<string, unknown>) => {
      const { status, conversation_id } = data as {
        status: string;
        conversation_id?: string;
      };

      if (status === 'READ' || status === 'read') {
        log.message.debug('[useUnreadCountSync] Message marked as READ - invalidating unread counts');

        if (conversation_id) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.unreadCount.conversation(conversation_id),
          });
        }

        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }
    };

    socketClient.onMessageRead(handleMessageRead);
    socketClient.onMessageStatus(handleMessageStatus);

    return () => {
      socketClient.off('message_read', handleMessageRead);
      socketClient.off('message_status', handleMessageStatus);
    };
  }, [queryClient]);
}
