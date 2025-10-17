/**
 * MessageInput Component
 * Text input for sending messages with auto-resize and send functionality
 */

'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, X, Smile } from 'lucide-react';
import type { Message } from '@/types/message';
import { Button } from '@/components/ui/button';

interface MessageInputProps {
  conversationId: string;
  onSend: (content: string, replyToId?: string) => Promise<void>;
  sending: boolean;
  replyTo?: Message;
  onCancelReply?: () => void;
  editingMessage?: Message;
  onSaveEdit?: (messageId: string, content: string) => Promise<void>;
  onCancelEdit?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MessageInput({
  conversationId,
  onSend,
  sending,
  replyTo,
  onCancelReply,
  editingMessage,
  onSaveEdit,
  onCancelEdit,
  placeholder = 'Type a message...',
  disabled = false,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update content when editingMessage changes
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content);
    } else {
      setContent('');
    }
  }, [editingMessage]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [content]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId]);

  const handleSend = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || sending || disabled) return;

    try {
      if (editingMessage && onSaveEdit) {
        // Edit mode
        await onSaveEdit(editingMessage.id, trimmedContent);
      } else {
        // Send mode
        await onSend(trimmedContent, replyTo?.id);
      }
      setContent('');

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send/edit message:', error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape' && editingMessage && onCancelEdit) {
      e.preventDefault();
      onCancelEdit();
    }
  };

  return (
    <div className="p-3 md:p-4 border-t-2 border-viber-purple/10 bg-gradient-to-r from-white to-viber-purple/5">
      <div className="max-w-4xl mx-auto">
        {/* Edit Preview */}
        {editingMessage && (
          <div className="mb-2 md:mb-3 flex items-center gap-2 p-3 bg-viber-purple/10 rounded-xl border-l-4 border-viber-purple shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs md:text-sm font-semibold text-viber-purple">Edit message</span>
              </div>
              <p className="text-sm md:text-base text-gray-700 truncate">{editingMessage.content}</p>
            </div>
            {onCancelEdit && (
              <button
                onClick={onCancelEdit}
                className="p-1.5 hover:bg-viber-purple/20 rounded-full transition shrink-0"
                type="button"
              >
                <X className="w-4 h-4 md:w-5 md:h-5 text-viber-purple" />
              </button>
            )}
          </div>
        )}

        {/* Reply Preview */}
        {replyTo && !editingMessage && (
          <div className="mb-2 md:mb-3 flex items-center gap-2 p-3 bg-viber-purple/5 rounded-xl border-l-4 border-viber-purple shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs md:text-sm font-semibold text-viber-purple">Reply to</span>
              </div>
              <p className="text-sm md:text-base text-gray-700 truncate">{replyTo.content}</p>
            </div>
            {onCancelReply && (
              <button
                onClick={onCancelReply}
                className="p-1.5 hover:bg-viber-purple/20 rounded-full transition shrink-0"
                type="button"
              >
                <X className="w-4 h-4 md:w-5 md:h-5 text-viber-purple" />
              </button>
            )}
          </div>
        )}

        {/* Input Area */}
        <div className="flex items-end gap-2">
          {/* Emoji Button (placeholder for future) */}
          <button
            type="button"
            className="p-2 md:p-2.5 hover:bg-viber-purple/10 rounded-full transition mb-1 hidden sm:block"
            disabled={disabled}
            title="Add emoji (coming soon)"
          >
            <Smile className="w-5 h-5 md:w-6 md:h-6 text-viber-purple/50" />
          </button>

          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={sending || disabled}
              className="w-full px-3 md:px-4 py-2 md:py-2.5 text-sm md:text-base border-2 border-viber-purple/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-viber-purple/50 focus:border-viber-purple resize-none disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>

          {/* Send/Save Button */}
          <Button
            onClick={handleSend}
            disabled={!content.trim() || sending || disabled || (editingMessage && content === editingMessage.content)}
            className="bg-gradient-to-r from-viber-purple to-viber-purple-dark hover:from-viber-purple-dark hover:to-viber-purple text-white rounded-full px-4 md:px-6 h-11 md:h-12 transition-all duration-200 disabled:opacity-50 shadow-md hover:shadow-lg"
            type="button"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : editingMessage ? (
              <span className="text-sm md:text-base font-medium">Save</span>
            ) : (
              <>
                <Send className="w-4 h-4 md:w-5 md:h-5 mr-0 md:mr-2" />
                <span className="hidden md:inline text-base font-medium">Send</span>
              </>
            )}
          </Button>
        </div>

        {/* Helper Text */}
        <p className="text-xs md:text-sm text-viber-purple/50 mt-2 text-center hidden md:block">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
