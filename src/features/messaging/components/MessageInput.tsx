/**
 * MessageInput Component
 * Text input for sending messages with auto-resize, file upload, and send functionality
 */

'use client';

import { log } from '@/lib/logger';
import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { Send, X, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Message } from '@/types/message';
import type { ConversationMember } from '@/types/conversation';
import { Button } from '@/components/ui/button';
import PollCreator from './PollCreator';
import { usePollActions } from '../hooks/usePollActions';
import { EmojiPickerButton } from './EmojiPickerButton';
import { FileUploadButton } from './FileUploadButton';
import { FilePreview } from './FilePreview';
import { VoiceRecordButton } from './VoiceRecordButton';
import { MentionSuggestions, type MentionSuggestion } from './MentionSuggestions';
import { messageService } from '../services/messageService';
import { transformServerMessage } from '../hooks/useMessages';

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
  /** Callback when a file/voice message is uploaded - used for optimistic UI updates */
  onFileUploaded?: (message: Message) => void;
  /** Conversation members for @mention autocomplete */
  members?: ConversationMember[];
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
  onFileUploaded,
  members = [],
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingIndex, setUploadingIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { createPoll } = usePollActions();

  // @mention state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionSuggestionsRef = useRef<MentionSuggestion[]>([]);

  // Handle emoji selection - insert at cursor position
  const handleEmojiSelect = (emoji: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textBefore = content.substring(0, start);
    const textAfter = content.substring(end);

    // Insert emoji at cursor position
    const newContent = textBefore + emoji + textAfter;
    setContent(newContent);

    // Restore focus and set cursor position after emoji
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + emoji.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Handle content change with @mention detection
  const handleContentChange = useCallback(
    (value: string) => {
      setContent(value);

      // Detect @ mention trigger
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);

      // Find the last @ that could be a mention trigger
      // Must be at start of text or preceded by a space/newline
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      if (lastAtIndex >= 0) {
        const charBefore = lastAtIndex === 0 ? ' ' : textBeforeCursor[lastAtIndex - 1];
        if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
          const filter = textBeforeCursor.slice(lastAtIndex + 1);
          // Only show if no space in filter (single word/name matching)
          if (!filter.includes(' ') || filter.length <= 30) {
            setMentionActive(true);
            setMentionFilter(filter);
            setMentionStartPos(lastAtIndex);
            setMentionIndex(0);
            return;
          }
        }
      }

      setMentionActive(false);
    },
    []
  );

  // Handle mention selection
  const handleMentionSelect = useCallback(
    (suggestion: MentionSuggestion) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const before = content.slice(0, mentionStartPos);
      const after = content.slice(textarea.selectionStart);
      const mentionText = `@${suggestion.displayName} `;
      const newContent = before + mentionText + after;

      setContent(newContent);
      setMentionActive(false);

      // Restore cursor position after mention
      setTimeout(() => {
        const newPos = mentionStartPos + mentionText.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [content, mentionStartPos]
  );

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
      log.error('Failed to send/edit message:', error);
    } finally {
      // Refocus after React render cycle completes (Messenger/Telegram pattern)
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention suggestions keyboard navigation
    if (mentionActive && mentionSuggestionsRef.current.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, mentionSuggestionsRef.current.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = mentionSuggestionsRef.current[mentionIndex];
        if (selected) handleMentionSelect(selected);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionActive(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // If files are selected, send files; otherwise send text (Messenger/Telegram pattern)
      if (selectedFiles.length > 0) {
        handleFileUpload();
      } else {
        handleSend();
      }
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
      log.error('Failed to create poll:', error);
      throw error;
    }
  };

  // Handle file selection (multiple files)
  const handleFileSelect = (files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
    setUploadProgress(0);
  };

  // Upload a single file and return the message
  const uploadOneFile = async (file: File): Promise<void> => {
    let fileToUpload = file;
    let encryptionMetadata: Record<string, string> | undefined;
    let encrypted = false;

    // E2EE: Encrypt file before upload if encryption is initialized
    try {
      const { encryptionService } = await import('@/features/encryption');
      if (encryptionService.isInitialized()) {
        const { encryptedBlob, fileKey, nonce, metadata } = await encryptionService.encryptFile(file);
        const { toBase64 } = await import('@/features/encryption/services/cryptoService');
        fileToUpload = new File([encryptedBlob], file.name, { type: 'application/octet-stream' });
        encryptionMetadata = {
          fileKey: toBase64(fileKey),
          fileNonce: toBase64(nonce),
          originalMimeType: metadata.mimeType,
          originalSize: String(metadata.originalSize),
        };
        encrypted = true;
      }
    } catch (encErr) {
      log.error('[MessageInput] File encryption failed, sending unencrypted:', encErr);
    }

    const rawMessage = await messageService.sendFileMessage({
      conversationId,
      file: fileToUpload,
      replyToId: replyTo?.id,
      onProgress: (progress) => setUploadProgress(progress),
      encrypted,
      encryptionMetadata,
    });

    if (rawMessage && onFileUploaded) {
      const message = transformServerMessage(rawMessage as unknown as Record<string, unknown>);
      log.info('[MessageInput] File uploaded, adding to UI:', message.id, message.type);
      onFileUploaded(message);
    }
  };

  // Handle file upload — sequential for multiple files
  const handleFileUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const failed: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      setUploadingIndex(i);
      setUploadProgress(0);
      try {
        await uploadOneFile(selectedFiles[i]);
      } catch (error) {
        log.error(`Failed to upload file "${selectedFiles[i].name}":`, error);
        failed.push(selectedFiles[i].name);
      }
    }

    setIsUploading(false);
    setSelectedFiles([]);
    setUploadProgress(0);
    setUploadingIndex(0);

    if (failed.length === 0) {
      if (onCancelReply) onCancelReply();
      toast.success(selectedFiles.length > 1 ? 'Files uploaded successfully' : 'File uploaded successfully');
    } else {
      toast.error(`Failed to upload: ${failed.join(', ')}`);
    }

    setTimeout(() => { textareaRef.current?.focus(); }, 0);
  };

  // Remove a single file from the selected list
  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadProgress(0);
  };

  return (
    <div className="sticky bottom-0 p-3 md:p-4 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface safe-bottom">
      <div className="max-w-4xl mx-auto">
        {/* Edit Preview */}
        {editingMessage && (
          <div className="mb-2 md:mb-3 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border-l-4 border-amber-500">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs md:text-sm font-semibold text-amber-700 dark:text-amber-400">Edit message</span>
              </div>
              <p className="text-sm md:text-base text-gray-700 dark:text-dark-text-secondary truncate">{editingMessage.content}</p>
            </div>
            {onCancelEdit && (
              <button
                onClick={onCancelEdit}
                className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-full transition shrink-0"
                type="button"
              >
                <X className="w-4 h-4 md:w-5 md:h-5 text-amber-700 dark:text-amber-400" />
              </button>
            )}
          </div>
        )}

        {/* Reply Preview - Matching the image design */}
        {replyTo && !editingMessage && (
          <div className="mb-2 md:mb-3 flex items-center gap-2 p-3 bg-gray-50 dark:bg-dark-bg rounded-lg border-l-4 border-viber-purple">
            <div className="flex-1 min-w-0">
              {/* Sender name in purple */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs md:text-sm font-semibold text-viber-purple">
                  {/* This will be dynamic based on sender in real implementation */}
                  Reply to
                </span>
              </div>
              {/* Message content in gray */}
              <p className="text-sm md:text-base text-gray-700 dark:text-dark-text-secondary truncate">{replyTo.content}</p>
            </div>
            {onCancelReply && (
              <button
                onClick={onCancelReply}
                className="p-1 hover:bg-gray-200 dark:hover:bg-dark-border rounded-full transition shrink-0"
                type="button"
              >
                <X className="w-4 h-4 md:w-5 md:h-5 text-gray-500 dark:text-dark-text-secondary" />
              </button>
            )}
          </div>
        )}

        {/* File Previews (when files selected) */}
        {selectedFiles.length > 0 && (
          <div className="mb-2 flex flex-col gap-2">
            {selectedFiles.map((file, index) => (
              <FilePreview
                key={`${file.name}-${index}`}
                file={file}
                uploadProgress={isUploading && index === uploadingIndex ? uploadProgress : 0}
                isUploading={isUploading && index === uploadingIndex}
                onRemove={() => handleRemoveFile(index)}
              />
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="flex items-end gap-2">
          {/* File Upload Button */}
          <div className="mb-1">
            <FileUploadButton
              onFileSelect={handleFileSelect}
              disabled={disabled || isUploading || isVoiceRecording || editingMessage !== undefined}
            />
          </div>

          {/* Voice Record Button */}
          <div className="mb-1">
            <VoiceRecordButton
              conversationId={conversationId}
              replyToId={replyTo?.id}
              disabled={disabled || isUploading || selectedFiles.length > 0 || editingMessage !== undefined}
              onRecordingStart={() => setIsVoiceRecording(true)}
              onRecordingEnd={() => setIsVoiceRecording(false)}
              onSendSuccess={() => {
                if (onCancelReply) onCancelReply();
              }}
              onVoiceUploaded={onFileUploaded}
            />
          </div>

          {/* Poll Button */}
          <button
            type="button"
            className="p-2 md:p-2.5 hover:bg-gray-100 dark:hover:bg-dark-border rounded-full transition mb-1"
            disabled={disabled || editingMessage !== undefined || isUploading || isVoiceRecording}
            title="Create poll"
            onClick={() => setShowPollCreator(true)}
          >
            <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-gray-400 dark:text-dark-text-secondary" />
          </button>

          {/* Emoji Button */}
          <div className="mb-1">
            <EmojiPickerButton
              onEmojiSelect={handleEmojiSelect}
              triggerClassName="p-2 md:p-2.5 hover:bg-gray-100 dark:hover:bg-dark-border rounded-full transition"
              side="top"
              align="center"
              ariaLabel="Add emoji"
              keepOpen={true}
            />
          </div>

          {/* Textarea with @mention suggestions */}
          <div className="flex-1 relative">
            {/* @mention autocomplete dropdown */}
            <MentionSuggestions
              members={members}
              filter={mentionFilter}
              selectedIndex={mentionIndex}
              onSelect={handleMentionSelect}
              onIndexChange={setMentionIndex}
              onSuggestionsChange={(s) => { mentionSuggestionsRef.current = s; }}
              visible={mentionActive}
            />
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isVoiceRecording ? 'Recording voice message...' : placeholder}
              disabled={sending || disabled || isVoiceRecording}
              className="w-full px-3 md:px-4 py-2 md:py-2.5 text-sm md:text-base border border-gray-300 dark:border-dark-border dark:bg-dark-bg dark:text-dark-text rounded-2xl focus:outline-none focus:ring-2 focus:ring-viber-purple focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed transition"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>

          {/* Send/Save Button */}
          <Button
            onClick={selectedFiles.length > 0 ? handleFileUpload : handleSend}
            disabled={
              ((!content.trim() && selectedFiles.length === 0) || sending || disabled || isUploading || isVoiceRecording) ||
              !!(editingMessage && content === editingMessage.content)
            }
            className="bg-viber-purple hover:bg-viber-purple-dark text-white rounded-full px-4 md:px-6 h-11 md:h-12 transition disabled:opacity-50"
            type="button"
          >
            {sending || isUploading ? (
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
        <p className="text-xs md:text-sm text-gray-400 dark:text-dark-text-secondary mt-2 text-center hidden md:block">
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
