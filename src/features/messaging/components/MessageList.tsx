/**
 * MessageList Component
 * Scrollable message container with date grouping and auto-scroll
 */

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageBubble } from './MessageBubble';
import { Loader2 } from 'lucide-react';
import type { Message } from '@/types/message';
import { useMessageVisibilityBatch } from '../hooks/useMessageVisibility';
import { useInView } from 'react-intersection-observer';

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  isFetchingNextPage?: boolean;
  hasMore: boolean;
  currentUserId: string;
  conversationId?: string; // Added for auto-mark-read
  onLoadMore?: () => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
  isGroupChat?: boolean;
  highlightedMessageId?: string | null;
  registerMessageRef?: (messageId: string, element: HTMLElement | null) => void;
  enableAutoRead?: boolean; // Toggle for auto-mark-read feature
}

interface MessageGroup {
  date: string;
  messages: Message[];
}

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
  onReact,
  getUserName,
  isGroupChat = false,
  highlightedMessageId = null,
  registerMessageRef,
  enableAutoRead = true,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const previousMessageCountRef = useRef(messages?.length || 0);
  const previousScrollHeightRef = useRef(0);
  const wasFetchingNextPageRef = useRef(false);
  const isLoadingMoreRef = useRef(false); // Prevent infinite scroll loop
  const initialLoadRef = useRef(true); // Track initial conversation load

  // Auto-mark-read with batched Intersection Observer (Telegram/Messenger pattern)
  const { trackMessage } = useMessageVisibilityBatch(
    conversationId || '',
    currentUserId
  );

  // Debug logging
  console.log('[MessageList] Props received:', { 
    messagesCount: messages?.length, 
    loading, 
    currentUserId,
    messages: messages 
  });

  console.log('[MessageList] 🔍 DETAILED MESSAGE INSPECTION:');
  (messages || []).forEach((msg, idx) => {
    console.log(`  [${idx}] id=${msg.id}, createdAt=${msg.createdAt}, content='${msg.content?.substring(0, 20)}...'`);
  });

  // Group messages by date
  const groupedMessages: MessageGroup[] = (messages || []).reduce((groups, message) => {
    // Validate date before formatting
    if (!message.createdAt) {
      console.log('[MessageList] ⚠️ SKIPPING message with no createdAt:', message);
      return groups;
    }

    const messageDate = new Date(message.createdAt);
    if (isNaN(messageDate.getTime())) {
      console.log('[MessageList] ⚠️ SKIPPING message with invalid createdAt:', message.createdAt, message);
      return groups; // Skip invalid dates
    }

    const dateKey = format(messageDate, 'yyyy-MM-dd');

    const existingGroup = groups.find((g) => g.date === dateKey);
    if (existingGroup) {
      existingGroup.messages.push(message);
    } else {
      groups.push({
        date: dateKey,
        messages: [message],
      });
    }

    return groups;
  }, [] as MessageGroup[]);

  console.log('[MessageList] Grouped messages:', { 
    groupCount: groupedMessages.length, 
    totalMessages: groupedMessages.reduce((sum, g) => sum + g.messages.length, 0),
    groups: groupedMessages 
  });

  // Format date label
  const formatDateLabel = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Unknown date';

      if (isToday(date)) return 'Today';
      if (isYesterday(date)) return 'Yesterday';
      return format(date, 'MMMM d, yyyy');
    } catch {
      return 'Unknown date';
    }
  };

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
        console.log('[MessageList] ✅ Preserved scroll position after loading more:', {
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
        console.log('[MessageList] ✅ Initial load complete, scrolled to bottom');
      }, 100);
    }
  }, [messages?.length, loading]);

  // Reset initial load flag when conversation changes
  useEffect(() => {
    initialLoadRef.current = true;
    console.log('[MessageList] 🔄 Conversation changed, resetting initial load flag');
  }, [conversationId]);

  // Reset loading flag when pagination completes
  useEffect(() => {
    if (!isFetchingNextPage && isLoadingMoreRef.current) {
      isLoadingMoreRef.current = false;
      console.log('[MessageList] ✅ Pagination complete, resetting loading flag');
    }
  }, [isFetchingNextPage]);

  // Detect manual scroll
  const handleScroll = () => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollArea;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);

    // Load more when scrolling to top (only if not already loading)
    // Prevent infinite loop by checking isLoadingMoreRef flag
    if (scrollTop < 100 && hasMore && !loading && !isFetchingNextPage
        && onLoadMore && !isLoadingMoreRef.current) {
      // Set flag BEFORE calling onLoadMore to prevent multiple calls
      isLoadingMoreRef.current = true;
      // Save scroll height before loading more
      previousScrollHeightRef.current = scrollArea.scrollHeight;
      console.log('[MessageList] 🔄 Loading more messages (scroll triggered)');
      onLoadMore();
    }
  };

  if (loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-viber-purple mx-auto mb-3" />
          <p className="text-gray-500 text-sm md:text-base">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (!loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center p-6">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl md:text-4xl">💬</span>
          </div>
          <p className="text-gray-500 mb-2 text-base md:text-lg">No messages yet</p>
          <p className="text-sm md:text-base text-gray-400">
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
      className="flex-1 overflow-y-auto bg-gray-50 px-3 md:px-4 py-3 md:py-4"
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
                  console.log('[MessageList] 🔄 Loading more messages (button clicked)');
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

        {/* Grouped Messages */}
        {groupedMessages.map((group) => (
          <div key={group.date} className="space-y-3 md:space-y-4">
            {/* Date Separator */}
            <div className="flex items-center justify-center py-2">
              <div className="px-3 md:px-4 py-1 md:py-1.5 bg-white border border-gray-200 rounded-full text-xs md:text-sm text-gray-600 shadow-sm">
                {formatDateLabel(group.date)}
              </div>
            </div>

            {/* Messages */}
            <div className="space-y-2 md:space-y-3">
              {group.messages.map((message, index) => {
                const isSent = message.senderId === currentUserId;

                // Debug logging for first message
                if (index === 0) {
                  console.log('[MessageList] Message senderId:', message.senderId);
                  console.log('[MessageList] Current userId:', currentUserId);
                  console.log('[MessageList] isSent:', isSent);
                  console.log('[MessageList] Match:', message.senderId === currentUserId);
                }

                const previousMessage = group.messages[index - 1];
                const showSender =
                  isGroupChat &&
                  !isSent &&
                  (!previousMessage || previousMessage.senderId !== message.senderId);

                const isHighlighted = highlightedMessageId === message.id;

                // Helper component to track visibility
                const MessageWithVisibility = () => {
                  const { ref, inView } = useInView({
                    threshold: 0.5, // 50% visible
                    triggerOnce: false,
                  });

                  // Track visibility after 1 second delay
                  useEffect(() => {
                    console.log('[MessageVisibility] Effect triggered:', {
                      messageId: message.id,
                      inView,
                      isSent,
                      messageStatus: message.status,
                      enableAutoRead,
                      hasConversationId: !!conversationId
                    });

                    if (!enableAutoRead || !conversationId || isSent || message.status === 'read') {
                      console.log('[MessageVisibility] Skipping mark-as-read:', {
                        reason: !enableAutoRead ? 'autoRead disabled' :
                                !conversationId ? 'no conversationId' :
                                isSent ? 'user sent this message' :
                                'already read'
                      });
                      return;
                    }

                    if (inView) {
                      console.log('[MessageVisibility] Message visible, scheduling mark-as-read in 1s:', message.id);
                      const timer = setTimeout(() => {
                        // Double-check still visible after delay
                        if (inView) {
                          console.log('[MessageVisibility] ✅ Calling trackMessage for:', message.id);
                          trackMessage(message.id);
                        }
                      }, 1000); // 1 second delay (Telegram/Messenger pattern)

                      return () => clearTimeout(timer);
                    }
                  }, [inView, isSent, message.status]);

                  return (
                    <div
                      ref={ref}
                      className={`transition-all duration-300 ${
                        isHighlighted
                          ? 'bg-yellow-100 rounded-lg p-2 -m-2 animate-pulse'
                          : ''
                      }`}
                    >
                      <MessageBubble
                        message={message}
                        isSent={isSent}
                        showSender={showSender}
                        senderName={getUserName ? getUserName(message.senderId) : undefined}
                        onEdit={isSent ? onEdit : undefined}
                        onDelete={isSent ? onDelete : undefined}
                        onReply={onReply}
                        onReact={onReact}
                        getUserName={getUserName}
                      />
                    </div>
                  );
                };

                return (
                  <div key={message.id} ref={(el) => registerMessageRef?.(message.id, el)}>
                    <MessageWithVisibility />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Scroll Anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
