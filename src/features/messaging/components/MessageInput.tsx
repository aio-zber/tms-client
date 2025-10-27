/**
 * MessageInput Component
 * Text input for sending messages with auto-resize and send functionality
 */

'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, X, Smile, BarChart3 } from 'lucide-react';
import type { Message } from '@/types/message';
import { Button } from '@/components/ui/button';
import PollCreator from './PollCreator';
import { usePollActions } from '../hooks/usePollActions';

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
  const [showPollCreator, setShowPollCreator] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { createPoll } = usePollActions();

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

  const handleCreatePoll = async (question: string, options: string[], multipleChoice: boolean) => {
    try {
      await createPoll({
        conversation_id: conversationId,
        question,
        options: options.map((text, index) => ({
          option_text: text,
          position: index,
        })),
        multiple_choice: multipleChoice,
      });
    } catch (error) {
      console.error('Failed to create poll:', error);
      throw error;
    }
  };

  return (
    <div className="p-3 md:p-4 border-t border-gray-200 bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Edit Preview */}
        {editingMessage && (
          <div className="mb-2 md:mb-3 flex items-center gap-2 p-3 bg-amber-50 rounded-lg border-l-4 border-amber-500">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs md:text-sm font-semibold text-amber-700">Edit message</span>
              </div>
              <p className="text-sm md:text-base text-gray-700 truncate">{editingMessage.content}</p>
            </div>
            {onCancelEdit && (
              <button
                onClick={onCancelEdit}
                className="p-1 hover:bg-amber-100 rounded-full transition shrink-0"
                type="button"
              >
                <X className="w-4 h-4 md:w-5 md:h-5 text-amber-700" />
              </button>
            )}
          </div>
        )}

        {/* Reply Preview - Matching the image design */}
        {replyTo && !editingMessage && (
          <div className="mb-2 md:mb-3 flex items-center gap-2 p-3 bg-gray-50 rounded-lg border-l-4 border-viber-purple">
            <div className="flex-1 min-w-0">
              {/* Sender name in purple */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs md:text-sm font-semibold text-viber-purple">
                  {/* This will be dynamic based on sender in real implementation */}
                  Reply to
                </span>
              </div>
              {/* Message content in gray */}
              <p className="text-sm md:text-base text-gray-700 truncate">{replyTo.content}</p>
            </div>
            {onCancelReply && (
              <button
                onClick={onCancelReply}
                className="p-1 hover:bg-gray-200 rounded-full transition shrink-0"
                type="button"
              >
                <X className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
              </button>
            )}
          </div>
        )}

        {/* Input Area */}
        <div className="flex items-end gap-2">
          {/* Poll Button */}
          <button
            type="button"
            className="p-2 md:p-2.5 hover:bg-gray-100 rounded-full transition mb-1"
            disabled={disabled || editingMessage !== undefined}
            title="Create poll"
            onClick={() => setShowPollCreator(true)}
          >
            <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-gray-400" />
          </button>

          {/* Emoji Button (placeholder for future) */}
          <button
            type="button"
            className="p-2 md:p-2.5 hover:bg-gray-100 rounded-full transition mb-1 hidden sm:block"
            disabled={disabled}
            title="Add emoji (coming soon)"
          >
            <Smile className="w-5 h-5 md:w-6 md:h-6 text-gray-400" />
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
              className="w-full px-3 md:px-4 py-2 md:py-2.5 text-sm md:text-base border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-viber-purple focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed transition"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>

          {/* Send/Save Button */}
          <Button
            onClick={handleSend}
            disabled={!content.trim() || sending || disabled || (editingMessage && content === editingMessage.content)}
            className="bg-viber-purple hover:bg-viber-purple-dark text-white rounded-full px-4 md:px-6 h-11 md:h-12 transition disabled:opacity-50"
            type="button"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : editingMessage ? (
              <span className="text-sm md:text-base">Save</span>
            ) : (
              <>
                <Send className="w-4 h-4 md:w-5 md:h-5 mr-0 md:mr-2" />
                <span className="hidden md:inline text-base">Send</span>
              </>
            )}
          </Button>
        </div>

        {/* Helper Text */}
        <p className="text-xs md:text-sm text-gray-400 mt-2 text-center hidden md:block">
          Press Enter to send, Shift+Enter for new line
        </p>

        {/* Poll Creator Dialog */}
        <PollCreator
          open={showPollCreator}
          onClose={() => setShowPollCreator(false)}
          onCreatePoll={handleCreatePoll}
          conversationId={conversationId}
        />
      </div>
    </div>
  );
}
