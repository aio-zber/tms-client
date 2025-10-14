/**
 * useMessages Hook
 * Manages message fetching and state for a conversation
 */

import { useState, useEffect, useCallback } from 'react';
import { messageService } from '../services/messageService';
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
  const [offset, setOffset] = useState(0);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await messageService.getConversationMessages(
        conversationId,
        { limit, offset: 0 }
      );

      setMessages(response.messages);
      setHasMore(response.has_more ?? false);
      setOffset(response.messages.length);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, limit]);

  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await messageService.getConversationMessages(
        conversationId,
        { limit, offset }
      );

      setMessages((prev) => [...prev, ...response.messages]);
      setHasMore(response.has_more ?? false);
      setOffset((prev) => prev + response.messages.length);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load more messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId, limit, offset, hasMore, loading]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (autoLoad && conversationId) {
      loadMessages();
    }
  }, [conversationId, autoLoad, loadMessages]);

  return {
    messages,
    loading,
    error,
    hasMore,
    loadMessages,
    loadMore,
    refresh,
  };
}
