/**
 * useUnifiedSearch Hook
 * Searches messages across all conversations
 * Returns results with resolved conversation and sender info
 */

import { useQuery } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';

interface UseUnifiedSearchOptions {
  query: string;
  enabled?: boolean;
}

/**
 * Normalized message search result with both snake_case and camelCase handled.
 * Backend may return either convention depending on the endpoint.
 */
export interface MessageSearchResult {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  conversationName?: string;
  content: string;
  type: string;
  createdAt: string;
}

interface UnifiedSearchResults {
  messages: MessageSearchResult[];
  messageCount: number;
}

/**
 * Transform raw search result into normalized format.
 * Handles both snake_case (backend) and camelCase field names.
 */
function transformSearchResult(raw: Record<string, unknown>): MessageSearchResult {
  return {
    id: raw.id as string,
    conversationId: (raw.conversation_id || raw.conversationId) as string,
    senderId: (raw.sender_id || raw.senderId) as string,
    senderName: (raw.sender_name || raw.senderName) as string | undefined,
    conversationName: (raw.conversation_name || raw.conversationName) as string | undefined,
    content: raw.content as string,
    type: (raw.type || 'text') as string,
    createdAt: (raw.created_at || raw.createdAt) as string,
  };
}

/**
 * Hook to search messages across all conversations
 */
export function useUnifiedSearch(options: UseUnifiedSearchOptions) {
  const { query, enabled = true } = options;

  const searchQuery = useQuery({
    queryKey: queryKeys.messages.search(query),
    queryFn: async (): Promise<UnifiedSearchResults> => {
      if (!query || query.trim().length < 2) {
        return { messages: [], messageCount: 0 };
      }

      const response = await messageService.searchMessages({
        query: query.trim(),
        limit: 20,
      });

      // Transform raw results to handle snake_case/camelCase
      const messages = (response.data as unknown as Record<string, unknown>[]).map(
        transformSearchResult
      );

      return {
        messages,
        messageCount: messages.length,
      };
    },
    enabled: enabled && !!query && query.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  return {
    messages: searchQuery.data?.messages ?? [],
    messageCount: searchQuery.data?.messageCount ?? 0,
    isSearching: searchQuery.isLoading,
    searchError: searchQuery.error as Error | null,
  };
}
