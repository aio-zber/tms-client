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
  placeholder?: string;
  disabled?: boolean;
}

export function MessageInput({
  conversationId,
  onSend,
  sending,
  replyTo,
  onCancelReply,
  placeholder = 'Type a message...',
  disabled = false,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      await onSend(trimmedContent, replyTo?.id);
      setContent('');

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Reply Preview */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border-l-2 border-viber-purple">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 mb-1">Replying to</p>
              <p className="text-sm text-gray-800 truncate">{replyTo.content}</p>
            </div>
            {onCancelReply && (
              <button
                onClick={onCancelReply}
                className="p-1 hover:bg-gray-200 rounded-full transition"
                type="button"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        )}

        {/* Input Area */}
        <div className="flex items-end gap-2">
          {/* Emoji Button (placeholder for future) */}
          <button
            type="button"
            className="p-2 hover:bg-gray-100 rounded-full transition mb-1"
            disabled={disabled}
            title="Add emoji (coming soon)"
          >
            <Smile className="w-5 h-5 text-gray-400" />
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
              className="w-full px-4 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-viber-purple focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={!content.trim() || sending || disabled}
            className="bg-viber-purple hover:bg-viber-purple-dark text-white rounded-full px-6 h-11 transition disabled:opacity-50"
            type="button"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" />
                Send
              </>
            )}
          </Button>
        </div>

        {/* Helper Text */}
        <p className="text-xs text-gray-400 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
