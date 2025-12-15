/**
 * useConversation Hook
 *
 * @deprecated Use useConversationQuery from useConversationsQuery.ts instead.
 *
 * This hook uses useState and doesn't subscribe to TanStack Query cache,
 * preventing real-time updates from WebSocket events. When other parts of the
 * app invalidate the conversation query (e.g., via WebSocket events), components
 * using this hook won't automatically receive the updates.
 *
 * Migration Guide:
 *   Before: const { conversation, loading } = useConversation(id, { autoLoad: true });
 *   After:  const { data: conversation, isLoading: loading } = useConversationQuery(id, true);
 *
 * Benefits of useConversationQuery:
 * - Automatic real-time updates via TanStack Query cache invalidation
 * - Better performance with built-in caching and deduplication
 * - Consistent with other query hooks in the app
 */

import { log } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { conversationService } from '../services/conversationService';
import type { Conversation } from '@/types/conversation';

interface UseConversationOptions {
  autoLoad?: boolean;
}

interface UseConversationReturn {
  conversation: Conversation | null;
  loading: boolean;
  error: Error | null;
  loadConversation: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConversation(
  conversationId: string,
  options: UseConversationOptions = {}
): UseConversationReturn {
  const { autoLoad = true } = options;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadConversation = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await conversationService.getConversationById(conversationId);
      setConversation(data);
    } catch (err) {
      setError(err as Error);
      log.message.error('Failed to load conversation:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const refresh = useCallback(async () => {
    await loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    if (autoLoad && conversationId) {
      loadConversation();
    }
  }, [conversationId, autoLoad, loadConversation]);

  return {
    conversation,
    loading,
    error,
    loadConversation,
    refresh,
  };
}
