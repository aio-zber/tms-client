/**
 * ChatSearchBar Component
 * Telegram/Messenger-style inline search for messages within a conversation
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatSearchBarProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  onResultSelect: (messageId: string) => void;
  onSearchStateChange?: (state: {
    query: string;
    currentIndex: number;
    totalResults: number;
  }) => void;
}

export default function ChatSearchBar({
  conversationId,
  isOpen,
  onClose,
  onResultSelect,
  onSearchStateChange,
}: ChatSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Search API call with debounce
  useEffect(() => {
    if (!isOpen || !searchQuery.trim()) {
      setResults([]);
      setTotalResults(0);
      setCurrentIndex(0);
      return;
    }

    setIsSearching(true);
    const debounceTimer = setTimeout(async () => {
      try {
        // TODO: Replace with actual API call
        const response = await fetch(
          `/api/v1/messages/search?query=${encodeURIComponent(
            searchQuery
          )}&conversation_id=${conversationId}&limit=100`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: searchQuery,
              conversation_id: conversationId,
              limit: 100,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const messageIds = data.data.map((msg: { id: string }) => msg.id);
          setResults(messageIds);
          setTotalResults(messageIds.length);
          setCurrentIndex(messageIds.length > 0 ? 1 : 0);

          // Jump to first result
          if (messageIds.length > 0) {
            onResultSelect(messageIds[0]);
          }
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, conversationId, isOpen, onResultSelect]);

  // Notify parent of search state changes
  useEffect(() => {
    if (onSearchStateChange) {
      onSearchStateChange({
        query: searchQuery,
        currentIndex,
        totalResults,
      });
    }
  }, [searchQuery, currentIndex, totalResults, onSearchStateChange]);

  // Handle close
  const handleClose = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setTotalResults(0);
    setCurrentIndex(0);
    onClose();
  }, [onClose]);

  // Navigate to previous result
  const handlePrevious = useCallback(() => {
    if (results.length === 0) return;

    const newIndex = currentIndex <= 1 ? totalResults : currentIndex - 1;
    setCurrentIndex(newIndex);
    onResultSelect(results[newIndex - 1]);
  }, [results, currentIndex, totalResults, onResultSelect]);

  // Navigate to next result
  const handleNext = useCallback(() => {
    if (results.length === 0) return;

    const newIndex = currentIndex >= totalResults ? 1 : currentIndex + 1;
    setCurrentIndex(newIndex);
    onResultSelect(results[newIndex - 1]);
  }, [results, currentIndex, totalResults, onResultSelect]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter - next result
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleNext();
      }
      // Shift+Enter - previous result
      else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        handlePrevious();
      }
      // Escape - close search
      else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrevious, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
      {/* Search Icon */}
      <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />

      {/* Search Input */}
      <div className="flex-1 min-w-0">
        <Input
          type="text"
          placeholder="Search in conversation..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            'h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
            'bg-transparent text-sm placeholder:text-gray-400'
          )}
          autoFocus
        />
      </div>

      {/* Results Counter & Navigation */}
      {searchQuery.trim() && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : totalResults > 0 ? (
            <>
              {/* Counter */}
              <span className="text-xs text-gray-600 font-medium min-w-[50px] text-center">
                {currentIndex} of {totalResults}
              </span>

              {/* Navigation Buttons */}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handlePrevious}
                  disabled={totalResults === 0}
                  className="h-7 w-7 p-0 hover:bg-gray-100"
                  title="Previous (Shift+Enter)"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleNext}
                  disabled={totalResults === 0}
                  className="h-7 w-7 p-0 hover:bg-gray-100"
                  title="Next (Enter)"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <span className="text-xs text-gray-500">No results</span>
          )}
        </div>
      )}

      {/* Close Button */}
      <Button
        size="sm"
        variant="ghost"
        onClick={handleClose}
        className="h-7 w-7 p-0 hover:bg-gray-100 flex-shrink-0"
        title="Close (Esc)"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
