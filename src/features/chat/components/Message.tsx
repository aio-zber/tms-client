/**
 * Message Component
 * Individual message bubble with sender info and actions
 */

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { MoreVertical, Edit2, Trash2, Smile } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useMessageActions } from '@/features/messaging';
import toast from 'react-hot-toast';

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
    reactions?: Array<{ user_id: string; emoji: string; count?: number; }>;
  };
  isOwnMessage: boolean;
  showAvatar: boolean;
  currentUserId?: string;
  onUpdate?: () => void;
  // Search-related props
  searchQuery?: string;
  isHighlighted?: boolean;
  isSearchHighlighted?: boolean;
  messageRef?: (element: HTMLDivElement | null) => void;
}

export default function Message({
  message,
  isOwnMessage,
  showAvatar,
  currentUserId,
  onUpdate,
  searchQuery,
  isHighlighted = false,
  isSearchHighlighted = false,
  messageRef
}: MessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const { editMessage, deleteMessage, addReaction, removeReaction, loading } = useMessageActions();

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

  /**
   * Highlight search query in message content
   * Returns JSX with highlighted matches
   */
  const highlightSearchText = (text: string, query: string) => {
    if (!query || !query.trim()) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <>
        {parts.map((part, index) =>
          part.toLowerCase() === query.toLowerCase() ? (
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
  };

  const handleEdit = async () => {
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      return;
    }

    const updated = await editMessage(message.id, { content: editContent.trim() });
    if (updated) {
      toast.success('Message updated');
      setIsEditing(false);
      onUpdate?.();
    } else {
      toast.error('Failed to update message');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this message?')) return;

    const success = await deleteMessage(message.id);
    if (success) {
      toast.success('Message deleted');
      onUpdate?.();
    } else {
      toast.error('Failed to delete message');
    }
  };

  const handleReaction = async (emoji: string) => {
    // Check if current user already reacted with this emoji
    const userAlreadyReacted = message.reactions?.some(
      r => r.emoji === emoji && r.user_id === currentUserId
    );

    let success = false;
    if (userAlreadyReacted) {
      // Remove reaction if user already reacted
      success = await removeReaction(message.id, emoji);
      if (success) {
        toast.success('Reaction removed');
      } else {
        toast.error('Failed to remove reaction');
      }
    } else {
      // Add new reaction
      success = await addReaction(message.id, emoji);
      if (success) {
        toast.success('Reaction added');
      } else {
        toast.error('Failed to add reaction');
      }
    }

    if (success) {
      setShowEmojiPicker(false);
      onUpdate?.();
    }
  };

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  return (
    <div
      ref={messageRef}
      className={`flex items-end space-x-2 ${
        isOwnMessage ? 'flex-row-reverse space-x-reverse' : ''
      } ${isHighlighted ? 'animate-pulse' : ''} ${
        isSearchHighlighted ? 'ring-2 ring-yellow-400 rounded-2xl' : ''
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
        className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} group relative`}
      >
        {/* Sender Name (for group chats, not own messages) */}
        {!isOwnMessage && showAvatar && message.sender_name && (
          <span className="text-xs text-gray-500 mb-1 px-3">
            {message.sender_name}
          </span>
        )}

        {/* Message Actions (hover menu) */}
        {isOwnMessage && !isEditing && (
          <div className="absolute top-0 right-0 -mt-2 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full bg-white shadow-sm border"
                  disabled={loading}
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                  <Smile className="h-4 w-4 mr-2" />
                  React
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Message Content */}
        {isEditing ? (
          <div className="flex items-center space-x-2">
            <Input
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEdit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="max-w-md"
              autoFocus
            />
            <Button size="sm" onClick={handleEdit} disabled={loading}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div
            className={`rounded-2xl px-4 py-2 max-w-md transition-all ${
              isOwnMessage
                ? 'bg-viber-purple text-white'
                : 'bg-gray-100 text-gray-900'
            } ${isSearchHighlighted ? 'bg-yellow-100 border-2 border-yellow-400' : ''}`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {searchQuery ? highlightSearchText(message.content, searchQuery) : message.content}
            </p>
          </div>
        )}

        {/* Timestamp and Edit indicator */}
        <div className="flex items-center space-x-1 mt-1 px-3">
          <span className="text-xs text-gray-400">
            {formatTime(message.created_at)}
          </span>
          {message.is_edited && (
            <span className="text-xs text-gray-400">(edited)</span>
          )}
        </div>

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="flex items-center space-x-1 mt-2 px-3 bg-white border border-gray-200 rounded-lg p-2 shadow-lg">
            {commonEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="hover:bg-gray-100 rounded px-2 py-1 text-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Reactions (if any) */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex items-center space-x-1 mt-1 px-3">
            {message.reactions.map((reaction, index: number) => (
              <button
                key={index}
                className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs hover:bg-gray-50 transition-colors"
                onClick={() => handleReaction(reaction.emoji)}
              >
                {reaction.emoji} {reaction.count || 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
