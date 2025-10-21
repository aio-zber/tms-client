/**
 * useConversationSearch Hook
 *
 * Implements Telegram/Messenger-style conversation search with:
 * - Debounced search queries (300ms)
 * - Fuzzy matching (trigram similarity backend)
 * - 5-minute cache TTL
 * - Hybrid approach: client-side for < 2 chars, API for >= 2 chars
 */

import { useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { conversationService } from '../services/conversationService';
import type { ConversationListResponse } from '@/types/conversation';

interface UseConversationSearchOptions {
  /**
   * Search query string
   */
  query: string;

  /**
   * Maximum number of results (default: 20, max: 50)
   */
  limit?: number;

  /**
   * Debounce delay in milliseconds (default: 300ms)
   */
  debounceMs?: number;

  /**
   * Enable/disable the search query (default: true)
   */
  enabled?: boolean;
}

/**
 * Hook for searching conversations with debouncing and caching
 *
 * @example
 * ```tsx
 * const { data, isLoading, isError } = useConversationSearch({
 *   query: searchInput,
 *   limit: 20
 * });
 * ```
 */
export function useConversationSearch({
  query,
  limit = 20,
  debounceMs = 300,
  enabled = true,
}: UseConversationSearchOptions) {
  // Debounce the search query (Telegram/Messenger pattern: 300ms)
  const [debouncedQuery] = useDebounce(query.trim(), debounceMs);

  // Only search if query is >= 2 characters (backend search)
  // For < 2 chars, frontend should use client-side filtering
  const shouldSearch = enabled && debouncedQuery.length >= 2;

  const queryResult = useQuery<ConversationListResponse, Error>({
    queryKey: ['conversations', 'search', debouncedQuery, limit],

    queryFn: async () => {
      return conversationService.searchConversations({
        q: debouncedQuery,
        limit,
      });
    },

    // Enable query only when search criteria are met
    enabled: shouldSearch,

    // Cache for 5 minutes (Telegram/Messenger pattern)
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)

    // Don't refetch on window focus for search results
    refetchOnWindowFocus: false,

    // Retry only once for search queries
    retry: 1,
  });

  return {
    ...queryResult,

    // Additional helpers
    conversations: queryResult.data?.data ?? [],
    hasMore: queryResult.data?.pagination?.has_more ?? false,
    isSearching: queryResult.isFetching,

    // Search is active when query is long enough
    isSearchActive: shouldSearch,

    // Expose debounced query for UI feedback
    debouncedQuery,
  };
}

export default useConversationSearch;
