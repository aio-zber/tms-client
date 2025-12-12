/**
 * useConversations Hook
 * Manages conversation list fetching and state with real-time WebSocket updates
 * Now uses TanStack Query for proper cache management and server state sync
 */

import { log } from '@/lib/logger';
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
      log.message.debug('[useConversations] Socket not initialized, skipping WebSocket listeners');
      return;
    }

    let currentUserId: string | null = null;

    // Get current user info for filtering own messages
    const initializeUser = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        currentUserId = currentUser?.id || null;
        log.message.debug('[useConversations] Current user ID:', currentUserId);
      } catch (error) {
        log.message.warn('[useConversations] Failed to get current user:', error);
      }
    };

    initializeUser();

    log.message.debug('[useConversations] Setting up WebSocket listeners for query invalidation');

    // Listen for new messages - invalidate unread count queries
    const handleNewMessage = (message: Record<string, unknown>) => {
      const conversationId = (message.conversation_id || message.conversationId) as string;
      const senderId = (message.sender_id || message.senderId) as string;

      log.message.debug('[useConversations] New message received:', { conversationId, senderId, currentUserId });

      // Invalidate unread count queries to refetch from server
      // Server automatically excludes current user's messages
      if (senderId !== currentUserId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
        log.message.debug('[useConversations] Invalidated unread count queries for conversation:', conversationId);
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

      log.message.debug('[useConversations] Message status update:', { status, conversationId, userId, currentUserId });

      // If current user marked message as read, invalidate unread count
      if (status === 'read' && userId === currentUserId && conversationId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
        log.message.debug('[useConversations] Invalidated unread count after mark as read');
      }
    };

    // NOTE: Member events (member_added, member_removed, member_left) are no longer sent by backend.
    // Backend now sends system messages via message:new event, which are handled by useMessages hook.
    // System messages automatically trigger conversation query invalidation (see useMessages.ts line 128-151).

    // Listen for conversation updated events
    const handleConversationUpdated = (data: Record<string, unknown>) => {
      const conversationId = data.conversation_id as string;
      const name = data.name as string | undefined;

      log.message.debug('[useConversations] Conversation updated:', {
        conversationId,
        hasNameChange: !!name,
      });

      // Invalidate to refetch updated details
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(conversationId),
      });

      // Also invalidate list (name shown in sidebar)
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    };

    socketClient.onNewMessage(handleNewMessage);
    socketClient.onMessageStatus(handleMessageStatus);
    socketClient.onConversationUpdated(handleConversationUpdated);

    // Cleanup
    return () => {
      log.message.debug('[useConversations] Cleaning up WebSocket listeners');
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_status', handleMessageStatus);
      socketClient.off('conversation_updated', handleConversationUpdated);
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
