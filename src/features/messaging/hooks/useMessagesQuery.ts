/**
 * useMessagesQuery Hook
 * TanStack Query version of message fetching with proper cache management
 * Supports infinite scrolling for loading older messages
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';
import { parseTimestamp } from '@/lib/dateUtils';
import type { Message } from '@/types/message';

interface UseMessagesQueryOptions {
  conversationId: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook to fetch messages using infinite query for pagination
 * Messages are returned in ASC order (oldest first) for chat display
 */
export function useMessagesQuery(options: UseMessagesQueryOptions) {
  const { conversationId, limit = 50, enabled = true } = options;

  const query = useInfiniteQuery({
    queryKey: queryKeys.messages.list(conversationId, { limit }),
    queryFn: async ({ pageParam }) => {
      const response = await messageService.getConversationMessages(conversationId, {
        limit,
        cursor: pageParam ? (pageParam as string) : undefined,
      });

      // Sort messages by sequence number (primary) and timestamp (fallback)
      // Sequence number ensures deterministic ordering even with timestamp collisions
      const sortedMessages = response.data.sort((a, b) => {
        // Primary: sequence number (ascending - oldest first for display)
        if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
          if (a.sequenceNumber !== b.sequenceNumber) {
            return a.sequenceNumber - b.sequenceNumber;
          }
        }

        // Fallback: timestamp (for backward compatibility during migration)
        try {
          const dateA = parseTimestamp(a.createdAt).getTime();
          const dateB = parseTimestamp(b.createdAt).getTime();
          return dateA - dateB; // Ascending order (oldest first)
        } catch (error) {
          console.error('[useMessagesQuery] Failed to sort messages:', error);
          return 0; // Keep original order if parsing fails
        }
      });

      return {
        data: sortedMessages,
        pagination: response.pagination,
      };
    },
    getNextPageParam: (lastPage) => {
      // If has_more is true, return the cursor for next page
      if (lastPage.pagination?.has_more && lastPage.pagination?.next_cursor) {
        return lastPage.pagination.next_cursor as string;
      }
      return undefined;
    },
    initialPageParam: undefined as string | undefined,
    enabled: enabled && !!conversationId,
    // Refetch on window focus to catch new messages
    refetchOnWindowFocus: true,
    // Consider stale after 10 seconds (more responsive without being excessive)
    staleTime: 10000,
  });

  // Flatten pages into a single array
  // Backend returns DESC (newest first), but each page is already reversed to ASC
  // So when we flatten, we get oldest to newest order for chat display
  // CRITICAL: Memoize to prevent creating new array on every render (causes infinite loops!)
  const messages: Message[] = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data?.pages]
  );

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  };
}
