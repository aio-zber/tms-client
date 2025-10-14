/**
 * Message Component
 * Individual message bubble with sender info and actions
 */

'use client';

import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MessageProps {
  message: {
    id: string;
    content: string;
    sender_id: string;
    sender_name?: string;
    sender_avatar?: string;
    type: 'text' | 'image' | 'file';
    created_at: string;
    is_edited: boolean;
    reactions?: any[];
  };
  isOwnMessage: boolean;
  showAvatar: boolean;
}

export default function Message({ message, isOwnMessage, showAvatar }: MessageProps) {
  const formatTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'HH:mm');
    } catch {
      return '';
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      className={`flex items-end space-x-2 ${
        isOwnMessage ? 'flex-row-reverse space-x-reverse' : ''
      }`}
    >
      {/* Avatar */}
      {showAvatar ? (
        <Avatar className="w-8 h-8">
          <AvatarImage src={message.sender_avatar} />
          <AvatarFallback className="bg-gray-300 text-gray-700 text-xs">
            {getInitials(message.sender_name || 'User')}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="w-8" /> // Spacer
      )}

      {/* Message Bubble */}
      <div
        className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
      >
        {/* Sender Name (for group chats, not own messages) */}
        {!isOwnMessage && showAvatar && message.sender_name && (
          <span className="text-xs text-gray-500 mb-1 px-3">
            {message.sender_name}
          </span>
        )}

        {/* Message Content */}
        <div
          className={`rounded-2xl px-4 py-2 max-w-md ${
            isOwnMessage
              ? 'bg-viber-purple text-white'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>

        {/* Timestamp and Edit indicator */}
        <div className="flex items-center space-x-1 mt-1 px-3">
          <span className="text-xs text-gray-400">
            {formatTime(message.created_at)}
          </span>
          {message.is_edited && (
            <span className="text-xs text-gray-400">(edited)</span>
          )}
        </div>

        {/* Reactions (if any) */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex items-center space-x-1 mt-1 px-3">
            {message.reactions.map((reaction: any, index: number) => (
              <div
                key={index}
                className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs"
              >
                {reaction.emoji} {reaction.count || 1}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
