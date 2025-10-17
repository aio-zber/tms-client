/**
 * useMessages Hook
 * Manages message fetching and state for a conversation
 */

import { useState, useEffect, useCallback } from 'react';
import { messageService } from '../services/messageService';
import { socketClient } from '@/lib/socket';
import type { Message } from '@/types/message';

interface UseMessagesOptions {
  limit?: number;
  autoLoad?: boolean;
}

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
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

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    setError(null);

    try {
      console.log('[useMessages] Fetching messages for conversation:', conversationId);
      const response = await messageService.getConversationMessages(
        conversationId,
        { limit }
      );

      console.log('[useMessages] Received response:', response);
      console.log('[useMessages] Messages count:', response.data?.length);
      console.log('[useMessages] First message:', response.data?.[0]);

      setMessages(response.data || []);
      setHasMore(response.pagination?.has_more ?? false);
      setCursor(response.pagination?.next_cursor ?? undefined);
    } catch (err) {
      setError(err as Error);
      console.error('[useMessages] Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, limit]);

  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore || loading || !cursor) return;

    setLoading(true);
    setError(null);

    try {
      const response = await messageService.getConversationMessages(
        conversationId,
        { limit, cursor }
      );

      setMessages((prev) => [...prev, ...response.data]);
      setHasMore(response.pagination?.has_more ?? false);
      setCursor(response.pagination?.next_cursor ?? undefined);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load more messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, limit, cursor, hasMore, loading]);

  const refresh = useCallback(async () => {
    setCursor(undefined);
    await loadMessages();
  }, [loadMessages]);

  // Add message optimistically (for sender's own messages)
  const addOptimisticMessage = useCallback((message: Message) => {
    console.log('[useMessages] Adding optimistic message:', message);
    setMessages((prev) => {
      // Check if message already exists (avoid duplicates)
      const exists = prev.some((m) => m.id === message.id);
      if (exists) {
        console.log('[useMessages] Message already exists, skipping optimistic add');
        return prev;
      }
      // Add new message at the end
      console.log('[useMessages] Adding new message to state');
      return [...prev, message];
    });
  }, []);

  useEffect(() => {
    if (autoLoad && conversationId) {
      loadMessages();
    }
  }, [conversationId, autoLoad, loadMessages]);

  // WebSocket: Real-time message updates
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
      // When connect event fires, socket IS connected - join immediately
      if (!hasJoined) {
        joinRoom();
      }
    };
    
    socket.on('connect', handleConnect);

    // Listen for new messages
    const handleNewMessage = (message: Record<string, unknown>) => {
      console.log('[useMessages] 🔥🔥🔥 NEW MESSAGE HANDLER CALLED!');
      console.log('[useMessages] New message received via WebSocket:', message);
      console.log('[useMessages] Message type:', typeof message);
      console.log('[useMessages] Message keys:', Object.keys(message));
      
      setMessages((prev) => {
        // Check if message already exists (prevent duplicates from WebSocket)
        const messageId = message.id as string;
        const exists = prev.some((m) => m.id === messageId);
        if (exists) {
          console.log('[useMessages] Message already in state (from optimistic update), skipping WebSocket duplicate');
          return prev;
        }
        // Add new message
        console.log('[useMessages] ✅ Adding message to state:', messageId);
        return [...prev, message as unknown as Message];
      });
    };

    // Listen for message edits
    const handleMessageEdited = (updatedMessage: Record<string, unknown>) => {
      console.log('[useMessages] Message edited via WebSocket:', updatedMessage);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === (updatedMessage.id as string) ? (updatedMessage as unknown as Message) : msg
        )
      );
    };

    // Listen for message deletions
    const handleMessageDeleted = (data: Record<string, unknown>) => {
      console.log('[useMessages] Message deleted via WebSocket:', data);
      setMessages((prev) => prev.filter((msg) => msg.id !== (data.message_id as string)));
    };

    socketClient.onNewMessage(handleNewMessage);
    socketClient.onMessageEdited(handleMessageEdited);
    socketClient.onMessageDeleted(handleMessageDeleted);

    // Cleanup
    return () => {
      console.log('[useMessages] Cleaning up, leaving room:', conversationId);
      socketClient.leaveConversation(conversationId);
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_edited', handleMessageEdited);
      socketClient.off('message_deleted', handleMessageDeleted);
      socket.off('connect', handleConnect);
    };
  }, [conversationId]);

  return {
    messages,
    loading,
    error,
    hasMore,
    loadMessages,
    loadMore,
    refresh,
    addOptimisticMessage,
  };
}
