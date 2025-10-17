/**
 * MessageList Component
 * Scrollable message container with date grouping and auto-scroll
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageBubble } from './MessageBubble';
import { Loader2 } from 'lucide-react';
import type { Message } from '@/types/message';

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  currentUserId: string;
  onLoadMore?: () => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
  isGroupChat?: boolean;
}

interface MessageGroup {
  date: string;
  messages: Message[];
}

export function MessageList({
  messages,
  loading,
  hasMore,
  currentUserId,
  onLoadMore,
  onEdit,
  onDelete,
  onReply,
  onReact,
  getUserName,
  isGroupChat = false,
}: MessageListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const previousMessageCountRef = useRef(messages?.length || 0);

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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const messageCount = messages?.length || 0;
    if (autoScroll && messageCount > previousMessageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    previousMessageCountRef.current = messageCount;
  }, [messages?.length, autoScroll, messages]);

  // Scroll to bottom on initial load
  useEffect(() => {
    const hasMessages = (messages?.length || 0) > 0;
    if (hasMessages && !loading) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
    }
  }, [messages?.length, loading]);

  // Detect manual scroll
  const handleScroll = () => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollArea;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);

    // Load more when scrolling to top
    if (scrollTop < 100 && hasMore && !loading && onLoadMore) {
      onLoadMore();
    }
  };

  if (loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-viber-purple mx-auto mb-3" />
          <p className="text-gray-500">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (!loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center p-6">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💬</span>
          </div>
          <p className="text-gray-500 mb-2">No messages yet</p>
          <p className="text-sm text-gray-400">
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
      className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4"
    >
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Load More Button */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={onLoadMore}
              disabled={loading}
              className="px-4 py-2 text-sm text-viber-purple hover:bg-viber-purple/10 rounded-full transition disabled:opacity-50"
            >
              {loading ? (
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
          <div key={group.date} className="space-y-4">
            {/* Date Separator */}
            <div className="flex items-center justify-center py-2">
              <div className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-600 shadow-sm">
                {formatDateLabel(group.date)}
              </div>
            </div>

            {/* Messages */}
            <div className="space-y-2">
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

                return (
                  <MessageBubble
                    key={message.id}
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
