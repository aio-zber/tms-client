/**
 * useJumpToMessage Hook
 * Handles scrolling to a specific message and highlighting it
 * Similar to Messenger/Telegram's jump-to-message functionality
 *
 * Enhanced with search result highlighting support
 */

import { useCallback, useRef, useState } from 'react';

interface UseJumpToMessageReturn {
  jumpToMessage: (messageId: string, options?: JumpToMessageOptions) => void;
  highlightedMessageId: string | null;
  searchHighlightId: string | null;
  registerMessageRef: (messageId: string, element: HTMLElement | null) => void;
  clearSearchHighlight: () => void;
}

interface JumpToMessageOptions {
  /** Whether this is a search result (persistent highlight) */
  isSearchResult?: boolean;
  /** Highlight duration in milliseconds (default: 3000) */
  highlightDuration?: number;
  /** Scroll behavior (default: 'smooth') */
  behavior?: ScrollBehavior;
}

/**
 * Hook to manage jumping to specific messages and highlighting them
 * Usage:
 * 1. Call registerMessageRef for each message in the list
 * 2. Call jumpToMessage when user clicks a search result or reply
 * 3. Use highlightedMessageId for temporary highlight (fades after duration)
 * 4. Use searchHighlightId for persistent search result highlight
 */
export function useJumpToMessage(): UseJumpToMessageReturn {
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [searchHighlightId, setSearchHighlightId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Register a message element ref
   * Call this from each message component
   */
  const registerMessageRef = useCallback((messageId: string, element: HTMLElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element);
    } else {
      messageRefs.current.delete(messageId);
    }
  }, []);

  /**
   * Jump to a specific message and highlight it
   * Enhanced to support search result highlighting
   */
  const jumpToMessage = useCallback(
    (messageId: string, options: JumpToMessageOptions = {}) => {
      const {
        isSearchResult = false,
        highlightDuration = 3000,
        behavior = 'smooth',
      } = options;

      const element = messageRefs.current.get(messageId);

      if (element) {
        // Scroll to the message with specified behavior and center it
        element.scrollIntoView({
          behavior,
          block: 'center',
          inline: 'nearest',
        });

        if (isSearchResult) {
          // For search results, set persistent highlight (no auto-fade)
          setSearchHighlightId(messageId);
          // Also apply temporary highlight for emphasis
          setHighlightedMessageId(messageId);

          // Clear temporary highlight after a short duration
          if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
          }

          highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedMessageId(null);
          }, 2000); // Shorter duration for search results
        } else {
          // For non-search jumps (like reply), use temporary highlight only
          setHighlightedMessageId(messageId);

          // Clear any existing highlight timeout
          if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
          }

          // Remove highlight after specified duration
          highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedMessageId(null);
          }, highlightDuration);
        }
      } else {
        console.warn(`[useJumpToMessage] Message element not found for ID: ${messageId}`);
        // TODO: If message not loaded, fetch messages around target message
      }
    },
    []
  );

  /**
   * Clear search highlight (when closing search or navigating away)
   */
  const clearSearchHighlight = useCallback(() => {
    setSearchHighlightId(null);
  }, []);

  return {
    jumpToMessage,
    highlightedMessageId,
    searchHighlightId,
    registerMessageRef,
    clearSearchHighlight,
  };
}
