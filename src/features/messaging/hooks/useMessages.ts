/**
 * useMessages Hook
 * Manages message fetching and state for a conversation
 * Now uses TanStack Query for proper cache management and server state sync
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { queryKeys } from '@/lib/queryClient';
import { useMessagesQuery } from './useMessagesQuery';
import type { Message } from '@/types/message';

interface UseMessagesOptions {
  limit?: number;
  autoLoad?: boolean;
}

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  isFetchingNextPage: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMessages: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  addOptimisticMessage: (message: Message) => void;
}

export function useMessages(
  conversationId: string,
  options: UseMessagesOptions = {}
): UseMessagesReturn {
  const { limit = 50, autoLoad = true } = options;
  const queryClient = useQueryClient();

  // Use TanStack Query infinite query
  const {
    messages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useMessagesQuery({
    conversationId,
    limit,
    enabled: autoLoad,
  });

  // Add message optimistically (for sender's own messages)
  const addOptimisticMessage = useCallback((message: Message) => {
    console.log('[useMessages] Adding optimistic message:', message);

    // Optimistically add to query cache
    queryClient.setQueryData(
      queryKeys.messages.list(conversationId, { limit }),
      (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') return oldData;

        const data = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

        // Add message to the last page (most recent messages)
        const newPages = [...data.pages];
        const lastPage = newPages[newPages.length - 1];

        if (lastPage) {
          lastPage.data = [...lastPage.data, message];
        }

        return {
          ...data,
          pages: newPages,
        };
      }
    );
  }, [queryClient, conversationId, limit]);

  // WebSocket: Real-time message updates with query invalidation
  useEffect(() => {
    if (!conversationId) return;

    const socket = socketClient.getSocket();
    if (!socket) {
      console.warn('[useMessages] Socket not initialized');
      return;
    }

    let hasJoined = false;

    // Join the conversation room
    const joinRoom = () => {
      if (hasJoined) {
        console.log('[useMessages] Already joined room, skipping');
        return;
      }

      console.log('[useMessages] Joining conversation room:', conversationId);
      socketClient.joinConversation(conversationId);
      hasJoined = true;
    };

    // Try to join immediately if already connected
    if (socketClient.isConnected()) {
      console.log('[useMessages] Socket already connected, joining immediately');
      joinRoom();
    } else {
      console.log('[useMessages] Socket not connected, waiting for connection event...');
    }

    // Listen for connection events in case we're not connected yet
    const handleConnect = () => {
      console.log('[useMessages] Socket connect event fired!');
      if (!hasJoined) {
        joinRoom();
      }
    };

    socket.on('connect', handleConnect);

    // Listen for new messages - invalidate query to refetch
    const handleNewMessage = (message: Record<string, unknown>) => {
      console.log('[useMessages] New message received via WebSocket:', message);

      // Invalidate messages query to refetch from server
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });
    };

    // Listen for message edits - invalidate query
    const handleMessageEdited = (updatedMessage: Record<string, unknown>) => {
      console.log('[useMessages] Message edited via WebSocket:', updatedMessage);

      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });
    };

    // Listen for message deletions - invalidate query
    const handleMessageDeleted = (data: Record<string, unknown>) => {
      console.log('[useMessages] Message deleted via WebSocket:', data);

      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });
    };

    // Listen for reactions added - invalidate query
    const handleReactionAdded = (data: Record<string, unknown>) => {
      console.log('[useMessages] Reaction added via WebSocket:', data);

      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });
    };

    // Listen for reactions removed - invalidate query
    const handleReactionRemoved = (data: Record<string, unknown>) => {
      console.log('[useMessages] Reaction removed via WebSocket:', data);

      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });
    };

    socketClient.onNewMessage(handleNewMessage);
    socketClient.onMessageEdited(handleMessageEdited);
    socketClient.onMessageDeleted(handleMessageDeleted);
    socketClient.onReactionAdded(handleReactionAdded);
    socketClient.onReactionRemoved(handleReactionRemoved);

    // Cleanup
    return () => {
      console.log('[useMessages] Cleaning up, leaving room:', conversationId);
      socketClient.leaveConversation(conversationId);
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_edited', handleMessageEdited);
      socketClient.off('message_deleted', handleMessageDeleted);
      socketClient.off('reaction_added', handleReactionAdded);
      socketClient.off('reaction_removed', handleReactionRemoved);
      socket.off('connect', handleConnect);
    };
  }, [conversationId, queryClient, limit]);

  return {
    messages,
    loading: isLoading,
    isFetchingNextPage,
    error: error as Error | null,
    hasMore: hasNextPage ?? false,
    loadMessages: async () => { await refetch(); },
    loadMore: async () => { await fetchNextPage(); },
    refresh: async () => { await refetch(); },
    addOptimisticMessage,
  };
}
