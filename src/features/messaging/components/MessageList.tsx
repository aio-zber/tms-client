/**
 * MessageList Component
 * Scrollable message container with Messenger-style time separators and auto-scroll
 */

'use client';

import { log } from '@/lib/logger';
import { useEffect, useLayoutEffect, useRef, useState, memo, useMemo } from 'react';
import { formatTimeSeparator, parseTimestamp } from '@/lib/dateUtils';
import { MessageBubble } from './MessageBubble';
import { Loader2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Message } from '@/types/message';

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  isFetchingNextPage?: boolean;
  hasMore: boolean;
  currentUserId: string;
  conversationId?: string;
  onLoadMore?: () => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onReply?: (message: Message) => void;
  onJumpToReply?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
  isGroupChat?: boolean;
  highlightedMessageId?: string | null;
  registerMessageRef?: (messageId: string, element: HTMLElement | null) => void;
  searchQuery?: string; // Search query for highlighting text
  searchHighlightId?: string | null; // ID of the currently highlighted search result
}

/**
 * MessageItem - Wrapper component for consistent message rendering
 * Note: Read tracking is now handled at conversation level (Messenger-style)
 * when user opens the conversation, not per-message visibility.
 */
interface MessageItemProps {
  message: Message;
  isSent: boolean;
  showSender: boolean;
  senderName?: string;
  currentUserId: string;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onReply?: (message: Message) => void;
  onJumpToReply?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
  searchQuery?: string;
  isHighlighted: boolean;
  isSearchHighlighted: boolean;
}

const MessageItem = memo(function MessageItem({
  message,
  isSent,
  showSender,
  senderName,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onJumpToReply,
  onReact,
  getUserName,
  searchQuery,
  isHighlighted,
  isSearchHighlighted,
}: MessageItemProps) {
  return (
    <div className="transition-all duration-300">
      <MessageBubble
        message={message}
        isSent={isSent}
        showSender={showSender}
        senderName={senderName}
        currentUserId={currentUserId}
        onEdit={isSent ? onEdit : undefined}
        onDelete={onDelete}
        onReply={onReply}
        onJumpToReply={onJumpToReply}
        onReact={onReact}
        getUserName={getUserName}
        searchQuery={searchQuery}
        isHighlighted={isHighlighted}
        isSearchHighlighted={isSearchHighlighted}
      />
    </div>
  );
});

export function MessageList({
  messages,
  loading,
  isFetchingNextPage = false,
  hasMore,
  currentUserId,
  conversationId,
  onLoadMore,
  onEdit,
  onDelete,
  onReply,
  onJumpToReply,
  onReact,
  getUserName,
  isGroupChat = false,
  highlightedMessageId = null,
  registerMessageRef,
  searchQuery,
  searchHighlightId,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const previousMessageCountRef = useRef(messages?.length || 0);
  const previousScrollHeightRef = useRef(0);
  const wasFetchingNextPageRef = useRef(false);
  const isLoadingMoreRef = useRef(false); // Prevent infinite scroll loop
  const initialLoadRef = useRef(true); // Track initial conversation load

  // Note: Read tracking is now handled at conversation level in Chat.tsx
  // when user opens conversation (Messenger-style), not per-message visibility.

  // Debug logging
  log.message.debug('[MessageList] Props received:', { 
    messagesCount: messages?.length, 
    loading, 
    currentUserId,
    messages: messages 
  });

  log.message.debug('[MessageList] 🔍 DETAILED MESSAGE INSPECTION:');
  (messages || []).forEach((msg, idx) => {
    log.message.debug(`  [${idx}] id=${msg.id}, createdAt=${msg.createdAt}, content='${msg.content?.substring(0, 20)}...'`);
  });

  // Filter out messages with invalid timestamps (memoized)
  const validMessages = useMemo(() => {
    return (messages || []).filter((message) => {
      try {
        parseTimestamp(message.createdAt);
        return true;
      } catch {
        log.message.debug('[MessageList] Skipping message with invalid timestamp:', message);
        return false;
      }
    });
  }, [messages]);

  log.message.debug('[MessageList] Valid messages:', { count: validMessages.length });

  // Preserve scroll position when loading more messages (prepending to top)
  // Using useLayoutEffect to run synchronously after DOM updates but before browser paint
  // This prevents visual flickering and ensures accurate scroll position preservation
  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const messageCount = messages?.length || 0;
    const previousCount = previousMessageCountRef.current;

    // If we just finished loading more messages (pagination from top)
    if (wasFetchingNextPageRef.current && !isFetchingNextPage && messageCount > previousCount) {
      const currentScrollHeight = scrollArea.scrollHeight;
      const previousScrollHeight = previousScrollHeightRef.current;
      const scrollHeightDiff = currentScrollHeight - previousScrollHeight;

      if (scrollHeightDiff > 0) {
        // Restore scroll position (keep visual position stable)
        // Add the height difference to maintain the same visual position
        scrollArea.scrollTop = scrollArea.scrollTop + scrollHeightDiff;
        log.message.debug('[MessageList] ✅ Preserved scroll position after loading more:', {
          previousHeight: previousScrollHeight,
          currentHeight: currentScrollHeight,
          diff: scrollHeightDiff,
          newScrollTop: scrollArea.scrollTop
        });
      }
    }
    // If we're at bottom and new messages arrive (normal chat) - but NOT during pagination
    else if (!isFetchingNextPage && !wasFetchingNextPageRef.current && autoScroll && messageCount > previousCount) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    // Track previous pagination state
    wasFetchingNextPageRef.current = isFetchingNextPage;
    previousMessageCountRef.current = messageCount;
    previousScrollHeightRef.current = scrollArea.scrollHeight;
  }, [messages, isFetchingNextPage, autoScroll]);

  // Scroll to bottom ONLY on initial load (not on pagination)
  useEffect(() => {
    const hasMessages = (messages?.length || 0) > 0;

    // Only scroll to bottom on INITIAL load, not when loading more messages
    if (hasMessages && !loading && initialLoadRef.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' });
        initialLoadRef.current = false; // Mark as initially loaded
        log.message.debug('[MessageList] ✅ Initial load complete, scrolled to bottom');
      }, 100);
    }
  }, [messages?.length, loading]);

  // Reset initial load flag when conversation changes
  useEffect(() => {
    initialLoadRef.current = true;
    log.message.debug('[MessageList] 🔄 Conversation changed, resetting initial load flag');
  }, [conversationId]);

  // Reset loading flag when pagination completes
  useEffect(() => {
    if (!isFetchingNextPage && isLoadingMoreRef.current) {
      isLoadingMoreRef.current = false;
      log.message.debug('[MessageList] ✅ Pagination complete, resetting loading flag');
    }
  }, [isFetchingNextPage]);

  // Detect manual scroll
  const handleScroll = () => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollArea;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 100;

    setAutoScroll(isAtBottom);
    // Show scroll-to-bottom button when user scrolls up >100px (Telegram/Messenger pattern)
    setShowScrollButton(distanceFromBottom > 100);

    // Load more when scrolling to top (only if not already loading)
    // Prevent infinite loop by checking isLoadingMoreRef flag
    if (scrollTop < 100 && hasMore && !loading && !isFetchingNextPage
        && onLoadMore && !isLoadingMoreRef.current) {
      // Set flag BEFORE calling onLoadMore to prevent multiple calls
      isLoadingMoreRef.current = true;
      // Save scroll height before loading more
      previousScrollHeightRef.current = scrollArea.scrollHeight;
      log.message.debug('[MessageList] 🔄 Loading more messages (scroll triggered)');
      onLoadMore();
    }
  };

  // Scroll to bottom handler (Telegram/Messenger pattern)
  const scrollToBottom = () => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior: 'smooth'
    });

    setAutoScroll(true); // Re-enable auto-scroll
    setShowScrollButton(false); // Hide button immediately
    log.message.debug('[MessageList] 📍 Scrolled to bottom via button');
  };

  if (loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="text-center">
          <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-viber-purple mx-auto mb-3" />
          <p className="text-gray-500 dark:text-dark-text-secondary text-sm md:text-base">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (!loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="text-center p-6">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-200 dark:bg-dark-border rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl md:text-4xl">💬</span>
          </div>
          <p className="text-gray-500 dark:text-dark-text-secondary mb-2 text-base md:text-lg">No messages yet</p>
          <p className="text-sm md:text-base text-gray-400 dark:text-dark-text-secondary">
            Start a conversation by sending a message below
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollAreaRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-gray-50 dark:bg-dark-bg px-3 md:px-4 py-3 md:py-4"
    >
      <div className="max-w-4xl mx-auto space-y-3 md:space-y-4">
        {/* Load More Button */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => {
                const scrollArea = scrollAreaRef.current;
                if (scrollArea && onLoadMore && !isLoadingMoreRef.current) {
                  // Set flag to prevent multiple loads
                  isLoadingMoreRef.current = true;
                  // Save scroll height before loading more
                  previousScrollHeightRef.current = scrollArea.scrollHeight;
                  log.message.debug('[MessageList] 🔄 Loading more messages (button clicked)');
                  onLoadMore();
                }
              }}
              disabled={loading || isFetchingNextPage || isLoadingMoreRef.current}
              className="px-4 py-2 text-sm text-viber-purple hover:bg-viber-purple/10 rounded-full transition disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Loading...
                </>
              ) : (
                'Load older messages'
              )}
            </button>
          </div>
        )}

        {/* Messages - Flat list with Messenger-style inline time separators */}
        <div className="space-y-2 md:space-y-3">
          {validMessages.map((message, index) => {
            const isSent = message.senderId === currentUserId;

            // Debug logging for first message
            if (index === 0) {
              log.message.debug('[MessageList] Message senderId:', message.senderId);
              log.message.debug('[MessageList] Current userId:', currentUserId);
              log.message.debug('[MessageList] isSent:', isSent);
            }

            const previousMessage = validMessages[index - 1];
            const showSender =
              isGroupChat &&
              !isSent &&
              (!previousMessage || previousMessage.senderId !== message.senderId);

            const isHighlighted = highlightedMessageId === message.id;
            const isSearchHighlighted = searchHighlightId === message.id;

            // Messenger-style: show time separator for first message
            // and when messages are >20 min apart (no date pill)
            let showTimeSeparator = false;
            let timeSeparatorText = '';
            if (message.createdAt) {
              try {
                if (index === 0) {
                  // First message always shows time context
                  showTimeSeparator = true;
                  timeSeparatorText = formatTimeSeparator(message.createdAt);
                } else if (previousMessage?.createdAt) {
                  const currTime = new Date(message.createdAt).getTime();
                  const prevTime = new Date(previousMessage.createdAt).getTime();
                  const gapMinutes = (currTime - prevTime) / 60000;
                  if (gapMinutes >= 20) {
                    showTimeSeparator = true;
                    timeSeparatorText = formatTimeSeparator(message.createdAt);
                  }
                }
              } catch {
                // Skip time separator on parse error
              }
            }

            return (
              <div key={message.id} ref={(el) => registerMessageRef?.(message.id, el)}>
                {/* Inline time separator (Messenger pattern - no date pill) */}
                {showTimeSeparator && (
                  <div className="flex items-center justify-center py-2">
                    <span className="text-[11px] text-gray-400">
                      {timeSeparatorText}
                    </span>
                  </div>
                )}
                <MessageItem
                  message={message}
                  isSent={isSent}
                  showSender={showSender}
                  senderName={getUserName ? getUserName(message.senderId) : undefined}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onReply={onReply}
                  onJumpToReply={onJumpToReply}
                  onReact={onReact}
                  getUserName={getUserName}
                  searchQuery={searchQuery}
                  isHighlighted={isHighlighted}
                  isSearchHighlighted={isSearchHighlighted}
                />
              </div>
            );
          })}
        </div>

        {/* Scroll Anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to Bottom Button - Telegram/Messenger Pattern */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={scrollToBottom}
            className="fixed bottom-24 right-6 z-40 w-12 h-12 md:w-14 md:h-14 bg-viber-purple hover:bg-viber-purple-dark text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="w-6 h-6 md:w-7 md:h-7" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
