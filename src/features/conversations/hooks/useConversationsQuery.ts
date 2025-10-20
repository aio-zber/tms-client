/**
 * useConversationsQuery Hook
 * TanStack Query version of conversations fetching with proper cache management
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { conversationService } from '../services/conversationService';
import { queryKeys } from '@/lib/queryClient';
import type { ConversationType } from '@/types/conversation';

interface UseConversationsQueryOptions {
  limit?: number;
  type?: ConversationType;
  enabled?: boolean;
}

/**
 * Hook to fetch conversations using infinite query for pagination
 */
export function useConversationsQuery(options: UseConversationsQueryOptions = {}) {
  const { limit = 20, type, enabled = true } = options;

  const query = useInfiniteQuery({
    queryKey: queryKeys.conversations.list({ limit, offset: 0, type }),
    queryFn: async ({ pageParam = 0 }) => {
      const response = await conversationService.getConversations({
        limit,
        offset: pageParam as number,
        type,
      });
      return response;
    },
    getNextPageParam: (lastPage, allPages) => {
      // If has_more is true, return next offset
      if (lastPage.pagination?.has_more) {
        const totalLoaded = allPages.reduce((sum, page) => sum + page.data.length, 0);
        return totalLoaded;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled,
    // Refetch conversations on window focus to catch new messages/conversations
    refetchOnWindowFocus: true,
    // Consider stale after 30 seconds
    staleTime: 30000,
  });

  // Flatten pages into a single array
  const conversations = query.data?.pages.flatMap((page) => page.data) ?? [];

  return {
    conversations,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single conversation by ID
 */
export function useConversationQuery(conversationId: string, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.conversations.detail(conversationId),
    queryFn: async () => {
      const conversation = await conversationService.getConversationById(conversationId);
      return conversation;
    },
    enabled: enabled && !!conversationId,
    // Keep conversation details fresh
    staleTime: 60000, // 1 minute
  });

  return {
    conversation: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
