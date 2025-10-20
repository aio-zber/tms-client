/**
 * useJumpToMessage Hook
 * Handles scrolling to a specific message and highlighting it
 * Similar to Messenger/Telegram's jump-to-message functionality
 */

import { useCallback, useRef, useState } from 'react';

interface UseJumpToMessageReturn {
  jumpToMessage: (messageId: string) => void;
  highlightedMessageId: string | null;
  registerMessageRef: (messageId: string, element: HTMLElement | null) => void;
}

/**
 * Hook to manage jumping to specific messages and highlighting them
 * Usage:
 * 1. Call registerMessageRef for each message in the list
 * 2. Call jumpToMessage when user clicks a search result
 * 3. Use highlightedMessageId to apply highlight styling
 */
export function useJumpToMessage(): UseJumpToMessageReturn {
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
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
   */
  const jumpToMessage = useCallback((messageId: string) => {
    const element = messageRefs.current.get(messageId);

    if (element) {
      // Scroll to the message with smooth behavior and center it
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });

      // Highlight the message
      setHighlightedMessageId(messageId);

      // Clear any existing highlight timeout
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      // Remove highlight after 3 seconds
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedMessageId(null);
      }, 3000);
    } else {
      console.warn(`[useJumpToMessage] Message element not found for ID: ${messageId}`);
    }
  }, []);

  return {
    jumpToMessage,
    highlightedMessageId,
    registerMessageRef,
  };
}
