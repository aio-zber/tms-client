/**
 * useChatSearch Hook
 * Manages in-conversation message search state and operations
 * Uses client-side filtering for instant results
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Message } from '@/types/message';

interface UseChatSearchOptions {
  conversationId: string;
  messages: Message[]; // Pass loaded messages for client-side filtering
  enabled?: boolean;
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
 * Provides Telegram/Messenger-style search functionality
 * 
 * Uses client-side filtering for instant results with loaded messages
 */
export function useChatSearch({
  conversationId,
  messages,
  enabled = true,
  onResultSelect,
}: UseChatSearchOptions): UseChatSearchReturn {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // Store onResultSelect callback in ref to prevent infinite re-renders
  const onResultSelectRef = useRef(onResultSelect);

  // Update ref when callback changes
  useEffect(() => {
    onResultSelectRef.current = onResultSelect;
  }, [onResultSelect]);

  // Client-side search: Filter messages by content
  const results = useMemo(() => {
    if (!enabled || !isSearchOpen || !searchQuery.trim()) {
      return [];
    }

    const query = searchQuery.trim().toLowerCase();
    
    // Filter messages that contain the search query
    const filteredMessages = messages.filter((message) => {
      // Only search text messages with content
      if (!message.content || message.type !== 'TEXT') {
        return false;
      }

      return message.content.toLowerCase().includes(query);
    });

    // Sort by createdAt descending (newest first)
    // This matches Telegram's behavior
    return filteredMessages.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [messages, searchQuery, enabled, isSearchOpen]);

  // Auto-select first result when search results change
  useEffect(() => {
    if (results.length > 0) {
      setCurrentIndex(1);
      onResultSelectRef.current?.(results[0].id);
    } else {
      setCurrentIndex(0);
    }
  }, [results]);

  // Open search
  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  // Close search
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setCurrentIndex(0);
    setError(null);
  }, []);

  // Toggle search
  const toggleSearch = useCallback(() => {
    if (isSearchOpen) {
      closeSearch();
    } else {
      openSearch();
    }
  }, [isSearchOpen, closeSearch, openSearch]);

  // Go to next result (with wrapping)
  const goToNext = useCallback(() => {
    if (results.length === 0) return;

    const newIndex = currentIndex >= results.length ? 1 : currentIndex + 1;
    setCurrentIndex(newIndex);
    onResultSelectRef.current?.(results[newIndex - 1].id);
  }, [results, currentIndex]);

  // Go to previous result (with wrapping)
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
    setSearchQuery('');
    setCurrentIndex(0);
    setError(null);
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
    isSearching: false, // Client-side search is instant
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
