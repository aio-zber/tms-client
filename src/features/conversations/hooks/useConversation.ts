/**
 * useConversation Hook
 * Manages a single conversation's data and state
 */

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
      console.error('Failed to load conversation:', err);
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
