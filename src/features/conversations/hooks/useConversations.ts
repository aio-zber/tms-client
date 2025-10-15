/**
 * useConversations Hook
 * Manages conversation list fetching and state
 */

import { useState, useEffect, useCallback } from 'react';
import { conversationService } from '../services/conversationService';
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
