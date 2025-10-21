/**
 * useUnreadCount Hook
 * Manages unread message counts
 */

import { useState, useEffect, useCallback } from 'react';
import { messageService } from '../services/messageService';

interface UseUnreadCountOptions {
  conversationId?: string;
  autoLoad?: boolean;
  refreshInterval?: number;
}

interface UseUnreadCountReturn {
  unreadCount: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useUnreadCount(
  options: UseUnreadCountOptions = {}
): UseUnreadCountReturn {
  const { conversationId, autoLoad = true, refreshInterval } = options;

  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadUnreadCount = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = conversationId
        ? await messageService.getConversationUnreadCount(conversationId)
        : await messageService.getTotalUnreadCount();

      setUnreadCount(response.unread_count ?? 0);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load unread count:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const refresh = useCallback(async () => {
    await loadUnreadCount();
  }, [loadUnreadCount]);

  useEffect(() => {
    if (autoLoad) {
      loadUnreadCount();
    }
  }, [conversationId, autoLoad, loadUnreadCount]);

  useEffect(() => {
    if (refreshInterval) {
      const interval = setInterval(loadUnreadCount, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, loadUnreadCount]);

  return {
    unreadCount,
    loading,
    error,
    refresh,
  };
}
