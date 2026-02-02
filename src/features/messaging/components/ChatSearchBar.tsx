/**
 * ChatSearchBar Component
 * Viber-style inline search for messages within a conversation
 *
 * This is a PURE UI COMPONENT that receives all state and actions as props.
 * Search logic is handled by the useChatSearch hook.
 */

'use client';

import { useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatSearchBarProps {
  // UI state
  isOpen: boolean;
  onClose: () => void;

  // Search state from useChatSearch hook
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentIndex: number;
  totalResults: number;
  isSearching?: boolean;

  // Navigation actions from useChatSearch hook
  goToNext: () => void;
  goToPrevious: () => void;
}

export default function ChatSearchBar({
  isOpen,
  onClose,
  searchQuery,
  setSearchQuery,
  currentIndex,
  totalResults,
  isSearching = false,
  goToNext,
  goToPrevious,
}: ChatSearchBarProps) {
  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter - next result
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        goToNext();
      }
      // Shift+Enter - previous result
      else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        goToPrevious();
      }
      // Escape - close search
      else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToNext, goToPrevious, onClose]);

  if (!isOpen) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface">
      {/* Search Icon */}
      <Search className="w-4 h-4 text-gray-400 dark:text-dark-text-secondary flex-shrink-0" />

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
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : totalResults > 0 ? (
            <>
              {/* Counter */}
              <span className="text-xs text-gray-600 dark:text-dark-text-secondary font-medium min-w-[60px] text-center">
                {currentIndex} of {totalResults}
              </span>

              {/* Navigation Buttons */}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={goToPrevious}
                  className="h-7 w-7 p-0 hover:bg-gray-100 dark:hover:bg-dark-border"
                  title="Previous (Shift+Enter)"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={goToNext}
                  className="h-7 w-7 p-0 hover:bg-gray-100 dark:hover:bg-dark-border"
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
        onClick={onClose}
        className="h-7 w-7 p-0 hover:bg-gray-100 dark:hover:bg-dark-border flex-shrink-0"
        title="Close (Esc)"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
