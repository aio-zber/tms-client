/**
 * useChatSearch Hook
 * Manages in-conversation message search state and operations
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { messageService } from '../services/messageService';
import type { Message } from '@/types/message';

interface UseChatSearchOptions {
  conversationId: string;
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
 */
export function useChatSearch({
  conversationId,
  enabled = true,
  onResultSelect,
}: UseChatSearchOptions): UseChatSearchReturn {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store onResultSelect callback in ref to prevent infinite re-renders
  // This allows us to always use the latest callback without triggering the search useEffect
  const onResultSelectRef = useRef(onResultSelect);

  // Update ref when callback changes (doesn't cause re-render or trigger effects)
  useEffect(() => {
    onResultSelectRef.current = onResultSelect;
  }, [onResultSelect]);

  // Search messages with debounce
  useEffect(() => {
    if (!enabled || !isSearchOpen || !searchQuery.trim()) {
      setResults([]);
      setCurrentIndex(0);
      setError(null);
      return;
    }

    setIsSearching(true);
    setError(null);

    const debounceTimer = setTimeout(async () => {
      try {
        const response = await messageService.searchMessages({
          query: searchQuery.trim(),
          conversation_id: conversationId,
          limit: 100, // Limit to 100 results for performance
        });

        setResults(response.data);

        // Auto-select first result using ref to avoid triggering re-search
        if (response.data.length > 0) {
          setCurrentIndex(1);
          onResultSelectRef.current?.(response.data[0].id);
        } else {
          setCurrentIndex(0);
        }
      } catch (err) {
        const error = err as Error;
        setError(error);

        // Enhanced error logging for debugging
        console.error('[Chat Search] Search failed:', {
          query: searchQuery.trim(),
          conversationId,
          error: error.message,
          stack: error.stack,
        });

        // User-friendly error message
        if (error.message.includes('404')) {
          console.error('[Chat Search] Search endpoint not found. Check API configuration.');
        } else if (error.message.includes('CORS')) {
          console.error('[Chat Search] CORS error. Check backend CORS settings.');
        } else if (error.message.includes('Network')) {
          console.error('[Chat Search] Network error. Check internet connection.');
        }

        setResults([]);
        setCurrentIndex(0);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, conversationId, enabled, isSearchOpen]);
  // ⚠️ IMPORTANT: onResultSelect is NOT in dependencies to prevent infinite re-renders
  // We use onResultSelectRef.current instead, which is updated separately

  // Open search
  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  // Close search
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setResults([]);
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

  // Go to next result
  const goToNext = useCallback(() => {
    if (results.length === 0) return;

    const newIndex = currentIndex >= results.length ? 1 : currentIndex + 1;
    setCurrentIndex(newIndex);
    onResultSelectRef.current?.(results[newIndex - 1].id);
  }, [results, currentIndex]);

  // Go to previous result
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
    setResults([]);
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
