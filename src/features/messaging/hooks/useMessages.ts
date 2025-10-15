/**
 * useMessages Hook
 * Manages message fetching and state for a conversation with real-time updates
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
      const response = await messageService.getConversationMessages(
        conversationId,
        { limit }
      );

      setMessages(response.data);
      setHasMore(response.pagination?.has_more ?? false);
      setCursor(response.pagination?.next_cursor ?? undefined);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load messages:', err);
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

  useEffect(() => {
    if (autoLoad && conversationId) {
      loadMessages();
    }
  }, [conversationId, autoLoad, loadMessages]);

  // WebSocket: TEMPORARILY DISABLED - Using polling fallback
  // TODO: Re-enable once WebSocket connection is fixed on Railway
  // useEffect(() => {
  //   if (!conversationId) return;
  //   socketClient.joinConversation(conversationId);
  //   ...
  // }, [conversationId]);

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
