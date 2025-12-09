/**
 * MessageBubble Component
 * Displays a single message with Viber-inspired styling
 */

'use client';

import { log } from '@/lib/logger';
import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Reply, Trash2, Smile, Edit } from 'lucide-react';
import { motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import type { Message } from '@/types/message';
import PollDisplay from './PollDisplay';
import { usePollActions } from '../hooks/usePollActions';
import { EmojiPickerButton } from './EmojiPickerButton';
import { CustomEmojiPicker } from '@/components/ui/emoji-picker';

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
  showSender?: boolean;
  senderName?: string;
  currentUserId?: string;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
  searchQuery?: string;
  isHighlighted?: boolean;
  isSearchHighlighted?: boolean;
}

interface ContextMenuPosition {
  x: number;
  y: number;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isSent,
  showSender = false,
  senderName,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onReact,
  getUserName,
  searchQuery,
  isHighlighted = false,
  isSearchHighlighted = false,
}: MessageBubbleProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const { voteOnPoll, closePoll } = usePollActions();

  // Common emojis for quick reactions (legacy, used by old emoji picker)
  const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];

  /**
   * Check if message can be deleted for everyone
   * Users can delete any of their messages for everyone (no time limit)
   */
  const canDeleteForEveryone = useMemo(() => {
    // Allow deletion of any message by its sender
    return true;
  }, []);

  // Mobile detection for responsive emoji picker
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // DEBUG: Log context menu props when opened
  useEffect(() => {
    if (contextMenu) {
    log.message.debug('[MessageBubble] Context menu opened:', {
        messageId: message.id,
        currentUserId,
        senderId: message.senderId,
        senderIdType: typeof message.senderId,
        currentUserIdType: typeof currentUserId,
        isOwnMessage: message.senderId === currentUserId,
        isSent,
        hasOnReact: !!onReact,
        hasOnReply: !!onReply,
        hasOnDelete: !!onDelete,
        isPoll: !!message.poll,
        canDeleteForEveryone,
      });
    }
  }, [contextMenu, message.id, currentUserId, message.senderId, isSent, onReact, onReply, onDelete, message.poll, canDeleteForEveryone]);

  /**
   * Memoized reaction grouping
   * Groups reactions by emoji and counts them
   */
  const groupedReactions = useMemo(() => {
    if (!message.reactions || message.reactions.length === 0) return {};

    return message.reactions.reduce((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [message.reactions]);

  /**
   * Set of emojis the current user has reacted with
   */
  const userReactions = useMemo(() => {
    if (!message.reactions || !currentUserId) return new Set<string>();

    return new Set(
      message.reactions
        .filter(r => r.userId === currentUserId)
        .map(r => r.emoji)
    );
  }, [message.reactions, currentUserId]);

  /**
   * Get formatted list of reactor names for a specific emoji
   */
  const getReactorNames = (emoji: string): string => {
    if (!message.reactions || !getUserName) return '';

    const reactors = message.reactions
      .filter(r => r.emoji === emoji)
      .map(r => getUserName(r.userId));

    if (reactors.length === 0) return '';
    if (reactors.length === 1) return reactors[0];
    if (reactors.length === 2) return `${reactors[0]} and ${reactors[1]}`;
    if (reactors.length <= 5) {
      const last = reactors[reactors.length - 1];
      const rest = reactors.slice(0, -1);
      return `${rest.join(', ')}, and ${last}`;
    }
    return `${reactors.slice(0, 3).join(', ')}, and ${reactors.length - 3} others`;
  };

  /**
   * Memoized highlighted message content
   * Prevents infinite re-renders by only recalculating when content or query changes
   * Shows "You removed a message" for deleted messages (Messenger pattern)
   */
  const highlightedContent = useMemo(() => {
    // Show deleted message placeholder if message is deleted
    if (message.deletedAt) {
      return isSent ? 'You removed a message' : `${senderName || 'User'} removed a message`;
    }

    if (!searchQuery || !searchQuery.trim() || !message.content) {
      return message.content;
    }

    const parts = message.content.split(new RegExp(`(${searchQuery})`, 'gi'));
    return (
      <>
        {parts.map((part, index) =>
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <mark
              key={index}
              className="bg-yellow-200 text-gray-900 rounded px-0.5"
            >
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  }, [message.content, message.deletedAt, searchQuery, isSent, senderName]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is inside emoji picker (which is inside context menu)
      const clickedElement = target as HTMLElement;
      const isInsideEmojiPicker =
        clickedElement.closest('.EmojiPickerReact') ||
        clickedElement.closest('[data-radix-popper-content-wrapper]') ||
        clickedElement.closest('[class*="emoji"]');

      if (isInsideEmojiPicker) {
    log.message.debug('[MessageBubble] Click inside emoji picker - keeping context menu open');
        return; // Don't close anything
      }

      // Close context menu if clicking outside
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
    log.message.debug('[MessageBubble] Click outside context menu - closing');
        setContextMenu(null);
        setShowTimestamp(false);
      }

      // Close old emoji picker if clicking outside
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(target)) {
        setShowEmojiPicker(false);
      }
    };

    const handleScroll = (event: Event) => {
      // Don't close context menu if scrolling inside the emoji picker
      const target = event.target as HTMLElement;
      const isScrollInsideEmojiPicker =
        target.closest('.EmojiPickerReact') ||
        target.closest('[data-radix-popper-content-wrapper]') ||
        target.closest('[class*="emoji"]');

      if (isScrollInsideEmojiPicker) {
    log.message.debug('[MessageBubble] Scroll inside emoji picker detected - keeping context menu open');
        return; // Don't close context menu
      }

    log.message.debug('[MessageBubble] Scroll outside emoji picker - closing context menu');
      setContextMenu(null);
      setShowEmojiPicker(false);
      setShowTimestamp(false); // Hide timestamp on scroll
    };

    if (contextMenu || showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [contextMenu, showEmojiPicker]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowTimestamp(true); // Show timestamp on right-click

    // Calculate viewport-aware position to prevent overflow on mobile
    const menuWidth = 200; // Approximate width including padding
    const menuHeight = 200; // Approximate height for calculation
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10; // Edge padding

    let x = e.clientX;
    let y = e.clientY;

    // Horizontal boundary check - prevent overflow on right
    if (x + menuWidth > viewportWidth - padding) {
      x = viewportWidth - menuWidth - padding;
    }
    // Prevent overflow on left
    if (x < padding) {
      x = padding;
    }

    // Vertical boundary check - prevent overflow on bottom
    if (y + menuHeight > viewportHeight - padding) {
      y = viewportHeight - menuHeight - padding;
    }
    // Prevent overflow on top
    if (y < padding) {
      y = padding;
    }

    setContextMenu({
      x,
      y,
    });
  };

  const handleMenuAction = (action: () => void) => {
    setContextMenu(null);
    setShowTimestamp(false); // Hide timestamp when menu closes
    action();
  };

  const handleReact = (emoji: string) => {
    setShowEmojiPicker(false);
    if (onReact) {
      onReact(message.id, emoji);
    }
  };

  const renderStatusIcon = () => {
    if (!isSent) return null;

    // Telegram/Messenger pattern: Use white icons on colored background
    // Opacity shows progression: sent (60%) → delivered (60%) → read (100% bright)
    switch (message.status) {
      case 'sent':
        return <Check className="w-3 h-3 text-white/60" />; // Single checkmark, dimmed
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-white/60" />; // Double checkmark, dimmed
      case 'read':
        return <CheckCheck className="w-3 h-3 text-white" />; // Double checkmark, bright (emphasizes "read")
      case 'sending':
        return (
          <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
        );
      case 'failed':
        return <span className="text-red-300 text-xs">Failed</span>; // Lighter red for visibility
      default:
        return null;
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      // Always show just time since date divider is already present
      return format(date, 'h:mm a');
    } catch {
      return 'Unknown';
    }
  };

  // Debug: Log reply data
  if (message.replyToId) {
    log.message.debug(`[MessageBubble] Message ${message.id} has replyToId: ${message.replyToId}`);
    log.message.debug(`[MessageBubble] message.replyTo present: ${message.replyTo !== undefined}`);
    log.message.debug(`[MessageBubble] message.replyTo data:`, message.replyTo);
  }

  // System messages have special centered rendering
  if (message.type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-2">
        <div className="text-xs md:text-sm text-gray-500 text-center px-4 py-1">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`flex gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
        {/* Message Content - relative positioning for absolute reactions */}
        <div
          className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[60%] flex flex-col relative ${
            isSent ? 'items-end' : 'items-start'
          }`}
          onContextMenu={handleContextMenu}
        >
          {/* Sender Name (for group chats) */}
          {showSender && !isSent && senderName && (
            <span className="text-xs md:text-sm text-gray-600 mb-1 px-3">{senderName}</span>
          )}

          {/* Reply-to Message - NEW DESIGN matching the image */}
          {message.replyTo && (
          <div
            className={`text-xs md:text-sm px-3 py-2 rounded-t-xl mb-[-8px] border-l-4 ${
              isSent
                ? 'bg-gray-100/50 border-viber-purple'
                : 'bg-gray-100 border-viber-purple'
            } max-w-full`}
          >
            {/* Sender name in viber purple */}
            <div className="font-semibold mb-0.5 text-viber-purple">
              {getUserName ? getUserName(message.replyTo.senderId) : 'User'}
            </div>
            {/* Message content in gray */}
            <div className="truncate text-gray-700">
              {message.replyTo.content.length > 50
                ? message.replyTo.content.slice(0, 50) + '...'
                : message.replyTo.content}
            </div>
          </div>
        )}

        <div className={`flex items-end gap-2 ${
          isHighlighted ? 'animate-pulse' : ''
        } ${
          isSearchHighlighted ? 'ring-2 ring-yellow-400 rounded-lg p-1 -m-1' : ''
        }`}>
          {/* Message Bubble */}
          {message.type === 'POLL' && message.poll ? (
            /* Poll Message - Full width without bubble styling */
            <div className="w-full order-1">
              <PollDisplay
                poll={message.poll}
                onVote={async (optionIds) => {
                  await voteOnPoll({ pollId: message.poll!.id, optionIds });
                }}
                onClose={
                  isSent
                    ? async () => {
                        await closePoll(message.poll!.id);
                      }
                    : undefined
                }
                isCreator={isSent}
                getUserName={getUserName}
              />
            </div>
          ) : (
            /* Regular Text Message */
            <div
              className={`px-3 md:px-4 py-2 md:py-2.5 ${message.replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} ${
                isSent
                  ? 'bg-viber-purple text-white rounded-br-sm order-1'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm order-2'
              } ${message.status === 'failed' ? 'opacity-60' : ''} ${
                isSearchHighlighted ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''
              } transition-all`}
            >
              <div className={`text-sm md:text-[15px] leading-relaxed break-words whitespace-pre-wrap ${
                message.deletedAt ? 'italic opacity-60' : ''
              }`}>
                {highlightedContent}
              </div>

              {/* Metadata (edited label and status only, NO timestamp) */}
              {(message.isEdited || message.status) && (
                <div
                  className={`flex items-center gap-1 mt-1 text-[11px] ${
                    isSent ? 'text-white/70 justify-end' : 'text-gray-500 justify-start'
                  }`}
                >
                  {message.isEdited && <span>(edited)</span>}
                  {renderStatusIcon()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timestamp (outside bubble, only shown on right-click) */}
        {showTimestamp && (
          <div className={`text-[10px] text-gray-400 mt-1 px-1 ${isSent ? 'text-right' : 'text-left'}`}>
            {formatTime(message.createdAt)}
          </div>
        )}

        {/* Reactions - Messenger style (below message bubble, small and compact) */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`absolute -bottom-3 left-0 flex flex-wrap gap-1 z-10`}>
            {/* Group reactions by emoji - now memoized */}
            {Object.entries(groupedReactions).map(([emoji, count]) => {
              const hasUserReacted = userReactions.has(emoji);

              return (
                <motion.button
                  key={emoji}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{
                    type: "spring",
                    damping: 20,
                    stiffness: 400
                  }}
                  title={getReactorNames(emoji)}
                  className={`px-1.5 py-0.5 rounded-full text-xs flex items-center gap-0.5 transition-all shadow-sm border ${
                    hasUserReacted
                      ? 'bg-white border-viber-purple text-viber-purple font-semibold'
                      : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                  onClick={() => onReact && onReact(message.id, emoji)}
                >
                  <span className="text-sm leading-none">{emoji}</span>
                  <span className="text-[10px] font-medium leading-none">{count}</span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] max-w-[200px] sm:max-w-none"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          {/* React option with inline emoji picker */}
          {onReact && !message.poll && !message.deletedAt && (
            <div className="relative">
              {isMobile ? (
                // Mobile: Use Dialog (centered modal) to prevent overflow
                <Dialog.Root>
                  <Dialog.Trigger asChild>
                    <button className="w-full px-4 py-2 justify-start text-sm md:text-base hover:bg-gray-100 flex items-center gap-2 text-gray-700 transition rounded-none h-auto">
                      <Smile className="w-4 h-4 md:w-5 md:h-5" />
                      <span>React</span>
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                    <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] z-50 w-[95vw] max-w-[400px] bg-white rounded-lg shadow-lg p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
                      <Dialog.Title className="sr-only">Select emoji reaction</Dialog.Title>
                      <Dialog.Description className="sr-only">Choose an emoji to react to this message</Dialog.Description>
                      <CustomEmojiPicker
                        onEmojiSelect={(emoji) => {
                          onReact(message.id, emoji);
                          setContextMenu(null);
                        }}
                      />
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              ) : (
                // Desktop: Use Popover (side positioning)
                <EmojiPickerButton
                  onEmojiSelect={(emoji) => {
                    onReact(message.id, emoji);
                    setContextMenu(null);
                  }}
                  triggerClassName="w-full px-4 py-2 justify-start text-sm md:text-base hover:bg-gray-100 flex items-center gap-2 text-gray-700 transition rounded-none h-auto"
                  triggerIcon={
                    <>
                      <Smile className="w-4 h-4 md:w-5 md:h-5" />
                      <span>React</span>
                    </>
                  }
                  side="right"
                  align="start"
                  ariaLabel="React to message"
                  keepOpen={true}
                />
              )}
            </div>
          )}
          {onReply && !message.deletedAt && (
            <button
              onClick={() => handleMenuAction(() => onReply(message))}
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-gray-100 flex items-center gap-2 text-gray-700 transition"
            >
              <Reply className="w-4 h-4 md:w-5 md:h-5" />
              Reply
            </button>
          )}

          {/* Edit - only for own messages and not deleted (system messages already returned early) */}
          {currentUserId && message.senderId === currentUserId && onEdit && !message.deletedAt && (
            <button
              onClick={() => handleMenuAction(() => onEdit(message.id))}
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-gray-100 flex items-center gap-2 text-gray-700 transition"
            >
              <Edit className="w-4 h-4 md:w-5 md:h-5" />
              Edit
            </button>
          )}

          {/* Delete for Me - available for ALL messages (own and others) - but not already deleted */}
          {onDelete && !message.deletedAt && (
            <button
              onClick={() => handleMenuAction(() => onDelete(message.id, 'me'))}
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-gray-100 flex items-center gap-2 text-gray-700 transition"
            >
              <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              Delete for Me
            </button>
          )}

          {/* Delete for Everyone - only for own messages, not already deleted, and within 48 hours */}
          {currentUserId && message.senderId === currentUserId && onDelete && !message.deletedAt && canDeleteForEveryone && (
            <button
              onClick={() => handleMenuAction(() => onDelete(message.id, 'everyone'))}
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-red-50 flex items-center gap-2 text-red-600 transition"
            >
              <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              Delete for Everyone
            </button>
          )}
        </div>
      )}

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-3 md:p-4"
          style={{
            left: isSent ? 'auto' : '50%',
            right: isSent ? '20px' : 'auto',
            top: '50%',
            transform: isSent ? 'translateY(-50%)' : 'translate(-50%, -50%)',
          }}
        >
          <div className="grid grid-cols-4 gap-2">
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className="text-2xl md:text-3xl hover:bg-gray-100 rounded p-2 md:p-3 transition"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
});
