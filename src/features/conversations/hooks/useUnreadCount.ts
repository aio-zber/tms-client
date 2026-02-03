/**
 * useUnreadCount Hook
 * Fetches unread message count from server using TanStack Query
 * Server is the source of truth - excludes user's own messages automatically
 */

import { useQuery } from '@tanstack/react-query';
import { messageService } from '@/features/messaging/services/messageService';
import { queryKeys } from '@/lib/queryClient';

interface UseUnreadCountOptions {
  conversationId?: string;
  enabled?: boolean;
}

interface UnreadCountData {
  conversation_id?: string;
  unread_count: number;
  total_unread_count?: number;
  conversations?: Record<string, number>;
}

/**
 * Hook to get unread count for a specific conversation or all conversations
 * @param options Configuration options
 * @returns Query result with unread count data
 */
export function useUnreadCount(options: UseUnreadCountOptions = {}) {
  const { conversationId, enabled = true } = options;

  // If conversationId provided, fetch per-conversation count
  // Otherwise fetch total count across all conversations
  const query = useQuery({
    queryKey: conversationId
      ? queryKeys.unreadCount.conversation(conversationId)
      : queryKeys.unreadCount.total(),
    queryFn: async (): Promise<UnreadCountData> => {
      if (conversationId) {
        const data = await messageService.getConversationUnreadCount(conversationId);
        return data as UnreadCountData;
      } else {
        const data = await messageService.getTotalUnreadCount();
        return data as UnreadCountData;
      }
    },
    enabled,
    // Refetch every 10 seconds to keep count fresh (reduced from 30s)
    refetchInterval: 10000,
    // Consider data stale after 5 seconds (reduced from 10s)
    staleTime: 5000,
  });

  return {
    unreadCount: conversationId
      ? query.data?.unread_count ?? 0
      : query.data?.total_unread_count ?? 0,
    conversationCounts: query.data?.conversations ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get unread counts for multiple conversations at once
 * More efficient than calling useUnreadCount multiple times
 */
export function useTotalUnreadCount() {
  return useUnreadCount({ conversationId: undefined });
}

/**
 * Hook to get unread count for a specific conversation
 */
export function useConversationUnreadCount(conversationId: string, enabled = true) {
  return useUnreadCount({ conversationId, enabled });
}
