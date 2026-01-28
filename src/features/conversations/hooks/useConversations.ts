/**
 * useConversations Hook
 * Manages conversation list fetching and state with real-time WebSocket updates.
 *
 * Real-time strategy (same as useMessages):
 * - DIRECT CACHE UPDATE (setQueryData) for instant sidebar rendering
 * - Background invalidation as fallback to sync with server truth
 */

import { log } from '@/lib/logger';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { authService } from '@/features/auth/services/authService';
import { queryKeys } from '@/lib/queryClient';
import { useConversationsQuery } from './useConversationsQuery';
import { useSocketReady } from '@/components/providers/SocketProvider';
import type { Conversation, ConversationType, ConversationListResponse } from '@/types/conversation';

interface UseConversationsOptions {
  limit?: number;
  type?: ConversationType;
  autoLoad?: boolean;
}

/**
 * Directly update the conversation list cache when a new message arrives.
 * Updates lastMessage, bumps conversation to top, and increments unreadCount.
 * This mirrors the instant cache update pattern from useMessages.ts.
 */
function updateConversationCacheWithNewMessage(
  oldData: unknown,
  conversationId: string,
  message: Record<string, unknown>,
  isOwnMessage: boolean
): unknown {
  if (!oldData || typeof oldData !== 'object') return oldData;

  const data = oldData as {
    pages: Array<ConversationListResponse>;
    pageParams: unknown[];
  };

  if (!data.pages || data.pages.length === 0) return oldData;

  // Build the new lastMessage from the WebSocket payload
  // Backend sends snake_case; the Conversation type uses mixed casing
  const newLastMessage = {
    content: (message.content as string) || '',
    senderId: (message.sender_id || message.senderId) as string,
    timestamp: (message.created_at || message.createdAt) as string,
  };

  // Find the conversation across all pages and extract it
  let targetConversation: Conversation | null = null;
  let targetPageIndex = -1;
  let targetConvIndex = -1;

  for (let pi = 0; pi < data.pages.length; pi++) {
    const page = data.pages[pi];
    for (let ci = 0; ci < page.data.length; ci++) {
      if (page.data[ci].id === conversationId) {
        targetConversation = page.data[ci];
        targetPageIndex = pi;
        targetConvIndex = ci;
        break;
      }
    }
    if (targetConversation) break;
  }

  if (!targetConversation) {
    // Conversation not in cache — let invalidation handle it
    return oldData;
  }

  // Create updated conversation (immutable — new object)
  const updatedConversation: Conversation = {
    ...targetConversation,
    lastMessage: newLastMessage,
    updatedAt: newLastMessage.timestamp,
    // Increment unread count for messages from other users
    unreadCount: isOwnMessage
      ? targetConversation.unreadCount
      : targetConversation.unreadCount + 1,
  };

  // Build new pages: remove conversation from its current position,
  // then prepend it to the first page (Viber/Messenger: most recent at top)
  const newPages = data.pages.map((page, pi) => {
    if (pi === 0 && pi === targetPageIndex) {
      // Conversation is on the first page — remove and prepend
      const filtered = page.data.filter((_, ci) => ci !== targetConvIndex);
      return { ...page, data: [updatedConversation, ...filtered] };
    }
    if (pi === 0) {
      // Prepend to first page
      return { ...page, data: [updatedConversation, ...page.data] };
    }
    if (pi === targetPageIndex) {
      // Remove from original page
      return { ...page, data: page.data.filter((_, ci) => ci !== targetConvIndex) };
    }
    return page;
  });

  return { ...data, pages: newPages };
}

export function useConversations(
  options: UseConversationsOptions = {}
) {
  const { limit = 20, type, autoLoad = true } = options;
  const queryClient = useQueryClient();
  const socketReady = useSocketReady();

  // Use TanStack Query infinite query
  const {
    conversations,
    isLoading,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useConversationsQuery({
    limit,
    type,
    enabled: autoLoad,
  });

  // WebSocket: Real-time direct cache updates + background invalidation
  // Re-runs when socketReady changes (fixes race condition on mount)
  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket || !socketReady) {
      log.message.debug('[useConversations] Socket not ready, waiting...');
      return;
    }

    let currentUserId: string | null = null;

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

    log.message.debug('[useConversations] Setting up WebSocket listeners');

    // The query key used by useConversationsQuery
    const listQueryKey = queryKeys.conversations.list({ limit, offset: 0, type });

    // Listen for new messages — direct cache update for instant sidebar rendering
    const handleNewMessage = (message: Record<string, unknown>) => {
      const conversationId = (message.conversation_id || message.conversationId) as string;
      const senderId = (message.sender_id || message.senderId) as string;

      if (!conversationId) return;

      const isOwnMessage = senderId === currentUserId;

      log.message.debug('[useConversations] New message received:', {
        conversationId,
        senderId,
        isOwnMessage,
      });

      // INSTANT UPDATE: Directly update the conversation cache
      const existingData = queryClient.getQueryData(listQueryKey);
      if (existingData) {
        queryClient.setQueryData(
          listQueryKey,
          (oldData: unknown) =>
            updateConversationCacheWithNewMessage(oldData, conversationId, message, isOwnMessage)
        );
        log.message.debug('[useConversations] Direct cache update applied for:', conversationId);
      }

      // Update unread counts for messages from others
      if (!isOwnMessage) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }

      // Background sync: invalidate to eventually reconcile with server
      // (handles edge cases like conversation not in cache, ordering drift, etc.)
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    };

    // Listen for message status updates (when messages are read)
    const handleMessageStatus = (data: Record<string, unknown>) => {
      const status = data.status as string;
      const conversationId = data.conversation_id as string;
      const userId = data.user_id as string;

      if (status === 'read' && userId === currentUserId && conversationId) {
        // Reset unread count to 0 instantly when current user marks as read
        const existingData = queryClient.getQueryData(listQueryKey);
        if (existingData) {
          queryClient.setQueryData(
            listQueryKey,
            (oldData: unknown) => {
              if (!oldData || typeof oldData !== 'object') return oldData;
              const data = oldData as {
                pages: Array<ConversationListResponse>;
                pageParams: unknown[];
              };
              if (!data.pages) return oldData;

              const newPages = data.pages.map((page) => ({
                ...page,
                data: page.data.map((conv) =>
                  conv.id === conversationId
                    ? { ...conv, unreadCount: 0 }
                    : conv
                ),
              }));
              return { ...data, pages: newPages };
            }
          );
        }

        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }
    };

    // Listen for conversation updated events (name/avatar changes)
    const handleConversationUpdated = (data: Record<string, unknown>) => {
      const conversationId = data.conversation_id as string;

      log.message.debug('[useConversations] Conversation updated:', conversationId);

      // Invalidate to refetch updated details
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    };

    socketClient.onNewMessage(handleNewMessage);
    socketClient.onMessageStatus(handleMessageStatus);
    socketClient.onConversationUpdated(handleConversationUpdated);

    return () => {
      log.message.debug('[useConversations] Cleaning up WebSocket listeners');
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_status', handleMessageStatus);
      socketClient.off('conversation_updated', handleConversationUpdated);
    };
  }, [queryClient, socketReady, limit, type]);

  return {
    conversations,
    // Only show loading skeleton on initial load (no cached data yet).
    // Background refetches from WebSocket invalidation update data seamlessly.
    loading: isLoading,
    error: error as Error | null,
    hasMore: hasNextPage ?? false,
    loadConversations: refetch,
    loadMore: fetchNextPage,
    refresh: refetch,
  };
}
