/**
 * useSearchMessages Hook
 * Handles message search functionality
 */

import { useState, useCallback } from 'react';
import { messageService } from '../services/messageService';
import type { Message, SearchMessagesRequest } from '@/types/message';

interface UseSearchMessagesReturn {
  results: Message[];
  searching: boolean;
  error: Error | null;
  hasMore: boolean;
  search: (query: string, filters?: Omit<SearchMessagesRequest, 'query'>) => Promise<void>;
  clear: () => void;
}

export function useSearchMessages(): UseSearchMessagesReturn {
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const search = useCallback(
    async (query: string, filters: Omit<SearchMessagesRequest, 'query'> = {}) => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setSearching(true);
      setError(null);

      try {
        const response = await messageService.searchMessages({
          query,
          ...filters,
        });

        setResults(response.messages);
        setHasMore(response.has_more ?? false);
      } catch (err) {
        setError(err as Error);
        console.error('Failed to search messages:', err);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
    setHasMore(false);
  }, []);

  return {
    results,
    searching,
    error,
    hasMore,
    search,
    clear,
  };
}
