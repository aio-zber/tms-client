/**
 * MessageBubble Component
 * Displays a single message with Viber-inspired styling
 */

'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, CheckCheck, MoreVertical, Reply, Edit, Trash2 } from 'lucide-react';
import type { Message } from '@/types/message';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
  showSender?: boolean;
  senderName?: string;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: Message) => void;
}

export function MessageBubble({
  message,
  isSent,
  showSender = false,
  senderName,
  onEdit,
  onDelete,
  onReply,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);

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
    <div
      className={`flex gap-2 ${isSent ? 'justify-end' : 'justify-start'} group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Message Content */}
      <div
        className={`max-w-[70%] sm:max-w-[60%] flex flex-col ${
          isSent ? 'items-end' : 'items-start'
        }`}
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
          {/* Action Menu (shown on hover) */}
          {showActions && (onEdit || onDelete || onReply) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`p-1 rounded-full hover:bg-gray-200 transition opacity-0 group-hover:opacity-100 ${
                    isSent ? 'order-2' : 'order-1'
                  }`}
                >
                  <MoreVertical className="w-4 h-4 text-gray-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isSent ? 'end' : 'start'}>
                {onReply && (
                  <DropdownMenuItem onClick={() => onReply(message)}>
                    <Reply className="w-4 h-4 mr-2" />
                    Reply
                  </DropdownMenuItem>
                )}
                {isSent && onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(message.id)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {isSent && onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(message.id)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

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
  );
}
