/**
 * MessageBubble Component
 * Displays a single message with Viber-inspired styling
 */

'use client';

import { useState, useRef, useEffect, memo } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Reply, Edit, Trash2, Smile } from 'lucide-react';
import type { Message } from '@/types/message';

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
  showSender?: boolean;
  senderName?: string;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
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
  onEdit,
  onDelete,
  onReply,
  onReact,
  getUserName,
}: MessageBubbleProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Common emojis for quick reactions
  const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
        setShowTimestamp(false); // Hide timestamp when closing menu
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    const handleScroll = () => {
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
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
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

    switch (message.status) {
      case 'sent':
        return <Check className="w-3 h-3" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="w-3 h-3 text-viber-purple" />;
      case 'sending':
        return (
          <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
        );
      case 'failed':
        return <span className="text-red-500 text-xs">Failed</span>;
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
    console.log(`[MessageBubble] Message ${message.id} has replyToId: ${message.replyToId}`);
    console.log(`[MessageBubble] message.replyTo present: ${message.replyTo !== undefined}`);
    console.log(`[MessageBubble] message.replyTo data:`, message.replyTo);
  }

  return (
    <>
      <div className={`flex gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
        {/* Message Content */}
        <div
          className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[60%] flex flex-col ${
            isSent ? 'items-end' : 'items-start'
          }`}
          onContextMenu={handleContextMenu}
        >
          {/* Sender Name (for group chats) */}
          {showSender && !isSent && senderName && (
            <span className="text-xs md:text-sm text-viber-purple/80 font-medium mb-1 px-3">{senderName}</span>
          )}

          {/* Reply-to Message */}
          {message.replyTo && (
          <div
            className={`text-xs md:text-sm px-3 py-2 rounded-t-xl mb-[-8px] border-l-4 ${
              isSent
                ? 'bg-viber-purple-dark border-viber-purple-light shadow-sm'
                : 'bg-viber-purple/10 border-viber-purple shadow-sm'
            } max-w-full`}
          >
            <div className={`font-semibold mb-0.5 ${isSent ? 'text-viber-purple-light' : 'text-viber-purple'}`}>
              {getUserName ? getUserName(message.replyTo.senderId) : 'User'}
            </div>
            <div className={`truncate ${isSent ? 'text-white' : 'text-gray-800'}`}>
              {message.replyTo.content.length > 50
                ? message.replyTo.content.slice(0, 50) + '...'
                : message.replyTo.content}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Message Bubble */}
          <div
            className={`px-3 md:px-4 py-2 md:py-2.5 ${message.replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} ${
              isSent
                ? 'bg-gradient-to-br from-viber-purple to-viber-purple-dark text-white rounded-br-sm order-1 shadow-md'
                : 'bg-white text-gray-900 rounded-bl-sm order-2 border border-gray-200 shadow-sm'
            } ${message.status === 'failed' ? 'opacity-60' : ''}`}
          >
            <p className="text-sm md:text-[15px] leading-relaxed break-words whitespace-pre-wrap">
              {message.content}
            </p>

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
        </div>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {/* Group reactions by emoji */}
            {Object.entries(
              message.reactions.reduce((acc, reaction) => {
                acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([emoji, count]) => (
              <button
                key={emoji}
                className={`px-2 py-1 rounded-full text-xs md:text-sm flex items-center gap-1 transition-all duration-200 hover:scale-105 ${
                  isSent
                    ? 'bg-viber-purple-light/30 hover:bg-viber-purple-light/40 text-white border border-viber-purple-light/50 shadow-sm'
                    : 'bg-viber-purple/10 hover:bg-viber-purple/20 text-viber-purple border border-viber-purple/30 shadow-sm'
                }`}
                onClick={() => onReact && onReact(message.id, emoji)}
              >
                <span className="text-base md:text-lg">{emoji}</span>
                {count > 1 && <span className="text-[10px] font-medium">{count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp (outside bubble, only shown on right-click) */}
        {showTimestamp && (
          <div className={`text-[10px] text-gray-400 mt-1 px-1 ${isSent ? 'text-right' : 'text-left'}`}>
            {formatTime(message.createdAt)}
          </div>
        )}
      </div>
    </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-xl shadow-2xl border-2 border-viber-purple/20 py-1 min-w-[160px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          <button
            onClick={() => {
              setContextMenu(null);
              setShowEmojiPicker(true);
            }}
            className="w-full px-4 py-2.5 text-left text-sm md:text-base hover:bg-viber-purple/10 flex items-center gap-2 text-viber-purple font-medium transition"
          >
            <Smile className="w-4 h-4 md:w-5 md:h-5" />
            React
          </button>
          {onReply && (
            <button
              onClick={() => handleMenuAction(() => onReply(message))}
              className="w-full px-4 py-2.5 text-left text-sm md:text-base hover:bg-viber-purple/10 flex items-center gap-2 text-viber-purple font-medium transition"
            >
              <Reply className="w-4 h-4 md:w-5 md:h-5" />
              Reply
            </button>
          )}
          {isSent && onEdit && (
            <button
              onClick={() => handleMenuAction(() => onEdit(message.id))}
              className="w-full px-4 py-2.5 text-left text-sm md:text-base hover:bg-viber-purple/10 flex items-center gap-2 text-viber-purple font-medium transition"
            >
              <Edit className="w-4 h-4 md:w-5 md:h-5" />
              Edit
            </button>
          )}
          {isSent && onDelete && (
            <button
              onClick={() => handleMenuAction(() => onDelete(message.id))}
              className="w-full px-4 py-2.5 text-left text-sm md:text-base hover:bg-red-50 flex items-center gap-2 text-red-600 font-medium transition"
            >
              <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              Delete
            </button>
          )}
        </div>
      )}

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="fixed z-50 bg-gradient-to-br from-white to-viber-purple/5 rounded-2xl shadow-2xl border-2 border-viber-purple/20 p-4"
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
                className="text-2xl md:text-3xl hover:bg-viber-purple/10 rounded-lg p-2 md:p-3 transition-all duration-200 hover:scale-110"
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
