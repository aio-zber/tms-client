/**
 * useConversations Hook
 * Manages conversation list fetching and state with real-time WebSocket updates
 * Now uses TanStack Query for proper cache management and server state sync
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { authService } from '@/features/auth/services/authService';
import { queryKeys } from '@/lib/queryClient';
import { useConversationsQuery } from './useConversationsQuery';
import type { ConversationType } from '@/types/conversation';

interface UseConversationsOptions {
  limit?: number;
  type?: ConversationType;
  autoLoad?: boolean;
}

export function useConversations(
  options: UseConversationsOptions = {}
) {
  const { limit = 20, type, autoLoad = true } = options;
  const queryClient = useQueryClient();

  // Use TanStack Query infinite query
  const {
    conversations,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useConversationsQuery({
    limit,
    type,
    enabled: autoLoad,
  });

  // WebSocket: Real-time query invalidation (server as source of truth)
  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket) {
      console.log('[useConversations] Socket not initialized, skipping WebSocket listeners');
      return;
    }

    let currentUserId: string | null = null;

    // Get current user info for filtering own messages
    const initializeUser = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        currentUserId = currentUser?.id || null;
        console.log('[useConversations] Current user ID:', currentUserId);
      } catch (error) {
        console.warn('[useConversations] Failed to get current user:', error);
      }
    };

    initializeUser();

    console.log('[useConversations] Setting up WebSocket listeners for query invalidation');

    // Listen for new messages - invalidate unread count queries
    const handleNewMessage = (message: Record<string, unknown>) => {
      const conversationId = (message.conversation_id || message.conversationId) as string;
      const senderId = (message.sender_id || message.senderId) as string;

      console.log('[useConversations] New message received:', { conversationId, senderId, currentUserId });

      // Invalidate unread count queries to refetch from server
      // Server automatically excludes current user's messages
      if (senderId !== currentUserId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
        console.log('[useConversations] Invalidated unread count queries for conversation:', conversationId);
      }

      // Also invalidate conversations list to update last message preview
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    };

    // Listen for message status updates (when messages are read)
    const handleMessageStatus = (data: Record<string, unknown>) => {
      const status = data.status as string;
      const conversationId = data.conversation_id as string;
      const userId = data.user_id as string;

      console.log('[useConversations] Message status update:', { status, conversationId, userId, currentUserId });

      // If current user marked message as read, invalidate unread count
      if (status === 'read' && userId === currentUserId && conversationId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
        console.log('[useConversations] Invalidated unread count after mark as read');
      }
    };

    socketClient.onNewMessage(handleNewMessage);
    socketClient.onMessageStatus(handleMessageStatus);

    // Cleanup
    return () => {
      console.log('[useConversations] Cleaning up WebSocket listeners');
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_status', handleMessageStatus);
    };
  }, [queryClient]); // Include queryClient in deps

  return {
    conversations,
    loading: isLoading || isFetchingNextPage,
    error: error as Error | null,
    hasMore: hasNextPage ?? false,
    loadConversations: refetch,
    loadMore: fetchNextPage,
    refresh: refetch,
  };
}
