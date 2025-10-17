/**
 * MessageBubble Component
 * Displays a single message with Viber-inspired styling
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
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
}

interface ContextMenuPosition {
  x: number;
  y: number;
}

export function MessageBubble({
  message,
  isSent,
  showSender = false,
  senderName,
  onEdit,
  onDelete,
  onReply,
  onReact,
}: MessageBubbleProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  
  // Common emojis for quick reactions
  const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    const handleScroll = () => {
      setContextMenu(null);
      setShowEmojiPicker(false);
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
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleMenuAction = (action: () => void) => {
    setContextMenu(null);
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
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  return (
    <>
      <div className={`flex gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
        {/* Message Content */}
        <div
          className={`max-w-[70%] sm:max-w-[60%] flex flex-col ${
            isSent ? 'items-end' : 'items-start'
          }`}
          onContextMenu={handleContextMenu}
        >
        {/* Sender Name (for group chats) */}
        {showSender && !isSent && senderName && (
          <span className="text-xs text-gray-600 mb-1 px-3">{senderName}</span>
        )}

        {/* Reply-to Message */}
        {message.replyTo && (
          <div
            className={`text-xs px-3 py-2 rounded-lg mb-1 border-l-2 ${
              isSent
                ? 'bg-viber-purple-dark/20 border-white/40'
                : 'bg-gray-200 border-gray-400'
            }`}
          >
            <span className="text-gray-600 dark:text-gray-300">
              {message.replyTo.content.length > 50
                ? message.replyTo.content.slice(0, 50) + '...'
                : message.replyTo.content}
            </span>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Message Bubble */}
          <div
            className={`px-4 py-2 rounded-2xl ${
              isSent
                ? 'bg-viber-purple text-white rounded-br-sm order-1'
                : 'bg-gray-100 text-gray-900 rounded-bl-sm order-2'
            } ${message.status === 'failed' ? 'opacity-60' : ''}`}
          >
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
              {message.content}
            </p>

            {/* Metadata (time, status, edited) */}
            <div
              className={`flex items-center gap-1 mt-1 text-[11px] ${
                isSent ? 'text-white/70 justify-end' : 'text-gray-500 justify-start'
              }`}
            >
              <span>{formatTime(message.createdAt)}</span>
              {message.isEdited && <span>(edited)</span>}
              {renderStatusIcon()}
            </div>
          </div>
        </div>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex gap-1 mt-1 px-2">
            {message.reactions.map((reaction) => (
              <span
                key={reaction.id}
                className="px-2 py-0.5 bg-white border border-gray-200 rounded-full text-xs"
              >
                {reaction.emoji}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
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
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-gray-700"
          >
            <Smile className="w-4 h-4" />
            React
          </button>
          {onReply && (
            <button
              onClick={() => handleMenuAction(() => onReply(message))}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-gray-700"
            >
              <Reply className="w-4 h-4" />
              Reply
            </button>
          )}
          {isSent && onEdit && (
            <button
              onClick={() => handleMenuAction(() => onEdit(message.id))}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-gray-700"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
          )}
          {isSent && onDelete && (
            <button
              onClick={() => handleMenuAction(() => onDelete(message.id))}
              className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      )}

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-3"
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
                className="text-2xl hover:bg-gray-100 rounded p-2 transition"
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
}
