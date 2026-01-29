/**
 * useChatSearch Hook
 * Manages in-conversation message search state and operations
 * Uses server-side search API to find ALL messages (not just loaded ones)
 *
 * Viber-style search: results counter with up/down navigation
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { messageService } from '@/features/messaging/services/messageService';
import { transformServerMessage } from '@/features/messaging/hooks/useMessages';
import type { Message } from '@/types/message';

interface UseChatSearchOptions {
  messages: Message[]; // Loaded messages for matching results that are already in view
  conversationId: string;
  _enabled?: boolean;
  onResultSelect?: (messageId: string) => void;
}

interface UseChatSearchReturn {
  // State
  isSearchOpen: boolean;
  searchQuery: string;
  results: Message[];
  currentIndex: number;
  totalResults: number;
  isSearching: boolean;
  error: Error | null;

  // Actions
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  setSearchQuery: (query: string) => void;
  goToNext: () => void;
  goToPrevious: () => void;
  goToResult: (index: number) => void;
  clearSearch: () => void;

  // Computed
  hasResults: boolean;
  currentResult: Message | null;
}

/**
 * Hook for managing in-conversation message search
 * Provides Viber-style search functionality with server-side search
 *
 * Uses server-side API to search ALL messages in the conversation,
 * then navigates between results using jumpToMessage
 */
export function useChatSearch({
  messages,
  conversationId,
  _enabled = true,
  onResultSelect,
}: UseChatSearchOptions): UseChatSearchReturn {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQueryState] = useState('');
  const [serverResults, setServerResults] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store onResultSelect callback in ref to prevent infinite re-renders
  const onResultSelectRef = useRef(onResultSelect);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update ref when callback changes
  useEffect(() => {
    onResultSelectRef.current = onResultSelect;
  }, [onResultSelect]);

  // All server results for count display and navigation
  const results = useMemo(() => {
    return serverResults;
  }, [serverResults]);

  // Server-side search with debounce
  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);

    // Clear existing timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (!query.trim()) {
      setServerResults([]);
      setCurrentIndex(0);
      setIsSearching(false);
      setError(null);
      return;
    }

    // Debounce 300ms before searching
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const response = await messageService.searchMessages({
          query: query.trim(),
          conversation_id: conversationId,
          limit: 100,
        });

        // Transform server results (snake_case to camelCase) and sort
        const transformed = (response.data || []).map((msg: Record<string, unknown> | Message) => {
          // If already camelCase (has createdAt), use as-is; otherwise transform
          if ('createdAt' in msg && msg.createdAt) return msg as Message;
          return transformServerMessage(msg as Record<string, unknown>);
        });

        // Sort results by createdAt descending (newest first) - Viber pattern
        const sorted = transformed.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });

        setServerResults(sorted);
        setError(null);

        // Auto-select first result
        if (sorted.length > 0) {
          setCurrentIndex(1);
          onResultSelectRef.current?.(sorted[0].id);
        } else {
          setCurrentIndex(0);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Search failed'));
        setServerResults([]);
        setCurrentIndex(0);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [conversationId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // Open search
  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  // Close search
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQueryState('');
    setServerResults([]);
    setCurrentIndex(0);
    setIsSearching(false);
    setError(null);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
  }, []);

  // Toggle search
  const toggleSearch = useCallback(() => {
    if (isSearchOpen) {
      closeSearch();
    } else {
      openSearch();
    }
  }, [isSearchOpen, closeSearch, openSearch]);

  // Go to next result (with wrapping) - Viber style: down arrow goes to older messages
  const goToNext = useCallback(() => {
    if (results.length === 0) return;

    const newIndex = currentIndex >= results.length ? 1 : currentIndex + 1;
    setCurrentIndex(newIndex);
    onResultSelectRef.current?.(results[newIndex - 1].id);
  }, [results, currentIndex]);

  // Go to previous result (with wrapping) - Viber style: up arrow goes to newer messages
  const goToPrevious = useCallback(() => {
    if (results.length === 0) return;

    const newIndex = currentIndex <= 1 ? results.length : currentIndex - 1;
    setCurrentIndex(newIndex);
    onResultSelectRef.current?.(results[newIndex - 1].id);
  }, [results, currentIndex]);

  // Go to specific result by index (1-based)
  const goToResult = useCallback(
    (index: number) => {
      if (index < 1 || index > results.length) return;

      setCurrentIndex(index);
      onResultSelectRef.current?.(results[index - 1].id);
    },
    [results]
  );

  // Clear search results but keep search open
  const clearSearch = useCallback(() => {
    setSearchQueryState('');
    setServerResults([]);
    setCurrentIndex(0);
    setIsSearching(false);
    setError(null);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
  }, []);

  // Computed values
  const hasResults = results.length > 0;
  const currentResult = currentIndex > 0 && currentIndex <= results.length
    ? results[currentIndex - 1]
    : null;

  return {
    // State
    isSearchOpen,
    searchQuery,
    results,
    currentIndex,
    totalResults: results.length,
    isSearching,
    error,

    // Actions
    openSearch,
    closeSearch,
    toggleSearch,
    setSearchQuery,
    goToNext,
    goToPrevious,
    goToResult,
    clearSearch,

    // Computed
    hasResults,
    currentResult,
  };
}
