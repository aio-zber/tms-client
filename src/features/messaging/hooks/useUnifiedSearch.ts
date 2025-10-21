/**
 * useUnifiedSearch Hook
 * Searches both conversations (by name) and messages (by content)
 */

import { useQuery } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';
import type { Message } from '@/types/message';

interface UseUnifiedSearchOptions {
  query: string;
  enabled?: boolean;
}

interface MessageSearchResult extends Message {
  conversation_id: string;
  conversation_name?: string;
}

interface UnifiedSearchResults {
  messages: MessageSearchResult[];
  messageCount: number;
}

/**
 * Hook to search messages across all conversations
 * Returns results grouped by conversation
 */
export function useUnifiedSearch(options: UseUnifiedSearchOptions) {
  const { query, enabled = true } = options;

  const searchQuery = useQuery({
    queryKey: queryKeys.messages.search(query),
    queryFn: async (): Promise<UnifiedSearchResults> => {
      if (!query || query.trim().length < 2) {
        return { messages: [], messageCount: 0 };
      }

      // Search messages using the backend API
      const response = await messageService.searchMessages({
        query: query.trim(),
        limit: 20, // Limit to top 20 results
      });

      return {
        messages: response.data as MessageSearchResult[],
        messageCount: response.data.length,
      };
    },
    enabled: enabled && !!query && query.trim().length >= 2,
    // Cache search results for 5 minutes
    staleTime: 5 * 60 * 1000,
  });

  return {
    messages: searchQuery.data?.messages ?? [],
    messageCount: searchQuery.data?.messageCount ?? 0,
    isSearching: searchQuery.isLoading,
    searchError: searchQuery.error as Error | null,
  };
}
