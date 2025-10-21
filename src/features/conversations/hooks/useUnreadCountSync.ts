/**
 * useUnreadCountSync Hook
 * Syncs unread counts with WebSocket events for real-time updates
 */

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
      console.warn('[useUnreadCountSync] Socket not initialized');
      return;
    }

    // Listen for message_read events
    const handleMessageRead = (data: Record<string, unknown>) => {
      console.log('[useUnreadCountSync] Message read event received:', data);

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
      console.log('[useUnreadCountSync] New message event received:', data);

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

    // Listen for message_status events
    const handleMessageStatus = (data: Record<string, unknown>) => {
      console.log('[useUnreadCountSync] Message status event received:', data);

      const status = data.status as string;
      const messageId = data.message_id as string;

      // If message is marked as READ, invalidate counts
      if (status === 'READ' || status === 'read') {
        // We need conversation_id to invalidate specific conversation
        // For now, invalidate total count (backend should provide conversation_id)
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
