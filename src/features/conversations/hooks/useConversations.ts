/**
 * useConversations Hook
 * Manages conversation list fetching and state with real-time WebSocket updates
 */

import { useState, useEffect, useCallback } from 'react';
import { conversationService } from '../services/conversationService';
import { socketClient } from '@/lib/socket';
import { authService } from '@/features/auth/services/authService';
import type { Conversation, ConversationType } from '@/types/conversation';

interface UseConversationsOptions {
  limit?: number;
  type?: ConversationType;
  autoLoad?: boolean;
}

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadConversations: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConversations(
  options: UseConversationsOptions = {}
): UseConversationsReturn {
  const { limit = 20, type, autoLoad = true } = options;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await conversationService.getConversations({
        limit,
        offset: 0,
        type,
      });

      setConversations(response.data);
      setHasMore(response.pagination.has_more ?? false);
      setOffset(response.data.length);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [limit, type]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await conversationService.getConversations({
        limit,
        offset,
        type,
      });

      setConversations((prev) => [...prev, ...response.data]);
      setHasMore(response.pagination.has_more ?? false);
      setOffset((prev) => prev + response.data.length);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load more conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, type, hasMore, loading]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (autoLoad) {
      loadConversations();
    }
  }, [autoLoad, loadConversations]);

  // WebSocket: Real-time unread count updates
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

    console.log('[useConversations] Setting up WebSocket listeners for unread count updates');

    // Listen for new messages in any conversation
    const handleNewMessage = (message: Record<string, unknown>) => {
      const conversationId = (message.conversation_id || message.conversationId) as string;
      const senderId = (message.sender_id || message.senderId) as string;

      console.log('[useConversations] New message received:', { conversationId, senderId, currentUserId });

      // Only increment unread count if message is NOT from current user
      if (senderId !== currentUserId) {
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId
              ? { ...conv, unreadCount: (conv.unreadCount || 0) + 1 }
              : conv
          )
        );
        console.log('[useConversations] Incremented unread count for conversation:', conversationId);
      }
    };

    // Listen for message status updates (when messages are read)
    const handleMessageStatus = (data: Record<string, unknown>) => {
      const status = data.status as string;
      const conversationId = data.conversation_id as string;
      const userId = data.user_id as string;

      console.log('[useConversations] Message status update:', { status, conversationId, userId, currentUserId });

      // If current user marked message as read, refresh the conversation's unread count
      if (status === 'read' && userId === currentUserId && conversationId) {
        // Optionally: Fetch fresh unread count from API for accuracy
        // For now, we'll rely on the mark-as-read action resetting the count
        console.log('[useConversations] Message marked as read by current user');
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
  }, []); // Empty deps - set up listeners once

  return {
    conversations,
    loading,
    error,
    hasMore,
    loadConversations,
    loadMore,
    refresh,
  };
}
