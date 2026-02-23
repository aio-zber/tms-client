/**
 * MessageBubble Component
 * Displays a single message with Viber-inspired styling
 */

'use client';

import { log } from '@/lib/logger';
import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { formatMessageTimestamp } from '@/lib/dateUtils';
import { Check, CheckCheck, Reply, Trash2, Smile, Edit, Download, File, FileText, FileSpreadsheet, Play, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import type { Message } from '@/types/message';
import PollDisplay from './PollDisplay';
import { usePollActions } from '../hooks/usePollActions';
import { EmojiPickerButton } from './EmojiPickerButton';
import { CustomEmojiPicker } from '@/components/ui/emoji-picker';
import { ImageLightbox } from './ImageLightbox';
import { VideoPlayer } from './VideoPlayer';
import { VideoLightbox } from './VideoLightbox';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { decryptedContentCache } from '../hooks/useMessages';
import { getApiBaseUrl, STORAGE_KEYS } from '@/lib/constants';

/** Build a proxy URL for a raw OSS file URL (avoids CORS; works with <img src> via ?token=). */
function ossProxyUrl(ossUrl: string): string {
  const token = typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '') : '';
  const params = new URLSearchParams({ url: ossUrl });
  if (token) params.set('token', token);
  return `${getApiBaseUrl()}/files/proxy?${params.toString()}`;
}

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
  showSender?: boolean;
  senderName?: string;
  currentUserId?: string;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onReply?: (message: Message) => void;
  onJumpToReply?: (messageId: string) => void;
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
  onJumpToReply,
  onReact,
  getUserName,
  searchQuery,
  isHighlighted: _isHighlighted = false,
  isSearchHighlighted = false,
}: MessageBubbleProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const timestampTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoLightboxOpen, setVideoLightboxOpen] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [decryptedFileUrl, setDecryptedFileUrl] = useState<string | null>(null);
  const [isDecryptingFile, setIsDecryptingFile] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Proxy URL for the file — used when decryptedFileUrl is not yet available.
  // Routes OSS URLs through the backend to avoid CORS failures on <img>/<video> elements.
  // For E2EE files this is the fetch source; for non-E2EE it's the display source.
  const proxyFileUrl = useMemo(() => {
    const url = message.metadata?.fileUrl;
    return url ? ossProxyUrl(url) : null;
  }, [message.metadata?.fileUrl]);

  const proxyThumbnailUrl = useMemo(() => {
    const url = message.metadata?.thumbnailUrl;
    return url ? ossProxyUrl(url) : null;
  }, [message.metadata?.thumbnailUrl]);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const { voteOnPoll, closePoll } = usePollActions();

  // Messenger pattern: only decrypt E2EE media when the bubble enters the viewport.
  // Prevents fetching+decrypting all files on conversation open (saturates HTTP/2 connection).
  useEffect(() => {
    const encMeta = message.metadata?.encryption;
    if (!encMeta?.fileKey) return; // Only need observer for E2EE messages
    const el = bubbleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id, message.metadata?.encryption?.fileKey]);

  // E2EE: Decrypt encrypted file content for display — gated on viewport visibility
  useEffect(() => {
    const encMeta = message.metadata?.encryption;
    if (!encMeta?.fileKey || !encMeta?.fileNonce || !proxyFileUrl) return;
    if (!isInView) return; // Wait until bubble is near viewport

    let objectUrl: string | null = null;
    const decryptFileContent = async () => {
      setIsDecryptingFile(true);
      try {
        // Fetch through backend proxy (token embedded in URL via proxyFileUrl)
        const response = await fetch(proxyFileUrl);
        const encryptedData = await response.arrayBuffer();
        const { encryptionService } = await import('@/features/encryption');
        const { fromBase64 } = await import('@/features/encryption/services/cryptoService');
        const mimeType = encMeta.originalMimeType || message.metadata!.mimeType || 'application/octet-stream';
        const decryptedBlob = await encryptionService.decryptFile(
          encryptedData, fromBase64(encMeta.fileKey!), fromBase64(encMeta.fileNonce!), mimeType
        );
        objectUrl = URL.createObjectURL(decryptedBlob);
        setDecryptedFileUrl(objectUrl);
      } catch (err) {
        log.message.error('[MessageBubble] File decryption failed:', err);
      } finally {
        setIsDecryptingFile(false);
      }
    };
    decryptFileContent();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id, message.metadata?.encryption?.fileKey, proxyFileUrl, isInView]);

  // Helper function to format file size
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Helper function to get file icon based on MIME type
  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return <File className="h-8 w-8 text-gray-500" />;
    if (mimeType.includes('pdf')) return <FileText className="h-8 w-8 text-red-500" />;
    if (mimeType.includes('word') || mimeType.includes('document')) return <FileText className="h-8 w-8 text-blue-600" />;
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
    if (mimeType.startsWith('video/')) return <Play className="h-8 w-8 text-purple-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

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

  // Cleanup timestamp tap timeout on unmount
  useEffect(() => {
    return () => {
      if (timestampTapTimeoutRef.current) clearTimeout(timestampTapTimeoutRef.current);
    };
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

    if (!message.content) return message.content;

    // URL pattern for linkification (Messenger-style clickable links)
    const urlSource = 'https?://[^\\s<>"{}|\\\\^`[\\]]+';
    // Mention pattern (non-capturing inner groups): @all, @everyone, or @Word Word...
    const mentionSource = '@(?:all|everyone|\\w+(?:\\s\\w+)*)';
    const escapedSearch = searchQuery?.trim()
      ? searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : null;

    // Build a single regex with ONE capture group to split on
    const patternSource = escapedSearch
      ? `(${urlSource}|${mentionSource}|${escapedSearch})`
      : `(${urlSource}|${mentionSource})`;
    const splitRegex = new RegExp(patternSource, 'gi');

    // Quick check: does content have anything to highlight?
    const testRegex = new RegExp(patternSource, 'gi');
    if (!testRegex.test(message.content)) {
      return message.content;
    }

    const parts = message.content.split(splitRegex);

    return (
      <>
        {parts.map((part, index) => {
          if (!part) return null;

          // Check if this part is a URL — make it a clickable link (Messenger pattern)
          if (/^https?:\/\//i.test(part)) {
            return (
              <a
                key={index}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`underline break-all ${
                  isSent ? 'text-white/90 hover:text-white' : 'text-viber-purple hover:text-viber-purple-dark'
                }`}
              >
                {part}
              </a>
            );
          }

          // Check if this part is a @mention
          if (new RegExp(`^${mentionSource}$`, 'i').test(part)) {
            const isAllMention = /^@(?:all|everyone)$/i.test(part);
            return (
              <span
                key={index}
                className={`font-semibold ${
                  isSent
                    ? 'text-white underline decoration-white/60'
                    : isAllMention
                      ? 'text-viber-purple-dark'
                      : 'text-viber-purple'
                }`}
              >
                {part}
              </span>
            );
          }

          // Check if this part matches search query
          if (escapedSearch && part.toLowerCase() === searchQuery!.trim().toLowerCase()) {
            return (
              <mark key={index} className="bg-yellow-200 text-gray-900 rounded px-0.5">
                {part}
              </mark>
            );
          }

          return part;
        })}
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
        <div className="text-xs md:text-sm text-gray-500 dark:text-dark-text-secondary text-center px-4 py-1">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`flex gap-2 ${isSent ? 'justify-end' : 'justify-start'}`} ref={bubbleRef}>
        {/* Message Content - relative positioning for absolute reactions */}
        <div
          className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[60%] flex flex-col relative ${
            isSent ? 'items-end' : 'items-start'
          }`}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => { if (!isMobile) setShowTimestamp(true); }}
          onMouseLeave={() => { if (!isMobile) setShowTimestamp(false); }}
          onClick={() => {
            if (isMobile) {
              // Single tap toggles timestamp for 3 seconds, then auto-hides
              setShowTimestamp((prev) => {
                if (!prev) {
                  if (timestampTapTimeoutRef.current) clearTimeout(timestampTapTimeoutRef.current);
                  timestampTapTimeoutRef.current = setTimeout(() => setShowTimestamp(false), 3000);
                  return true;
                }
                if (timestampTapTimeoutRef.current) clearTimeout(timestampTapTimeoutRef.current);
                return false;
              });
            }
          }}
        >
          {/* Sender Name (for group chats) */}
          {showSender && !isSent && senderName && (
            <span className="text-xs md:text-sm text-gray-600 dark:text-dark-text-secondary mb-1 px-3">{senderName}</span>
          )}

          {/* Reply-to Message - NEW DESIGN matching the image */}
          {message.replyTo && (
          <div
            onClick={() => onJumpToReply?.(message.replyTo!.id)}
            className={`text-xs md:text-sm px-3 py-2 rounded-t-xl mb-[-8px] border-l-4 ${
              isSent
                ? 'bg-gray-100/50 dark:bg-dark-border/50 border-viber-purple'
                : 'bg-gray-100 dark:bg-dark-border border-viber-purple'
            } max-w-full ${onJumpToReply ? 'cursor-pointer hover:brightness-95 active:brightness-90 transition-[filter]' : ''}`}
          >
            {/* Sender name in viber purple */}
            <div className="font-semibold mb-0.5 text-viber-purple">
              {getUserName ? getUserName(message.replyTo.senderId) : 'User'}
            </div>
            {/* Message content in gray — use decrypted cache if the replied-to message was encrypted */}
            <div className="truncate text-gray-700 dark:text-dark-text-secondary">
              {(() => {
                const replyContent =
                  decryptedContentCache.get(message.replyTo.id) || message.replyTo.content;
                // If still looks like ciphertext, show a neutral placeholder
                const display =
                  replyContent.startsWith('{"v":') ? '[Encrypted message]' : replyContent;
                return display.length > 50 ? display.slice(0, 50) + '...' : display;
              })()}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Message Bubble */}
          {/* Deleted Message - Show placeholder for ALL message types when deleted */}
          {message.deletedAt ? (
            <div
              className={`px-3 md:px-4 py-2 md:py-3 ${message.replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} ${
                isSent
                  ? 'bg-viber-purple/60 text-white/70 rounded-br-sm order-1'
                  : 'bg-gray-100 dark:bg-dark-received-bubble text-gray-500 dark:text-dark-text-secondary rounded-bl-sm order-2'
              } italic text-sm`}
            >
              {isSent ? 'You deleted this message' : `${senderName || 'User'} deleted this message`}
            </div>
          ) : message.type === 'POLL' && message.poll ? (
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
          ) : message.type === 'IMAGE' && message.metadata?.fileUrl ? (
            /* Image Message */
            <div
              className={`${message.replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} ${
                isSent
                  ? 'bg-viber-purple rounded-br-sm order-1'
                  : 'bg-gray-100 dark:bg-dark-received-bubble rounded-bl-sm order-2'
              } overflow-hidden cursor-pointer transition-all hover:opacity-90`}
              onClick={() => !isDecryptingFile && setLightboxOpen(true)}
            >
              {isDecryptingFile && !decryptedFileUrl ? (
                <div className="max-w-xs md:max-w-sm h-48 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-viber-purple border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={decryptedFileUrl || (thumbnailFailed ? proxyFileUrl! : (proxyThumbnailUrl || proxyFileUrl!))}
                alt={message.metadata.fileName || 'Image'}
                className="max-w-xs md:max-w-sm max-h-64 md:max-h-80 object-cover"
                loading="lazy"
                onError={() => {
                  // If proxied thumbnail fails, fall back to proxied main file URL
                  if (!decryptedFileUrl && !thumbnailFailed && proxyThumbnailUrl) {
                    setThumbnailFailed(true);
                  }
                }}
              />
              )}
              {/* Caption if present */}
              {message.content && message.content !== message.metadata.fileName && (
                <div className={`px-3 py-2 text-sm ${isSent ? 'text-white' : 'text-gray-900'}`}>
                  {message.content}
                </div>
              )}
              {/* Status for sent images */}
              {isSent && message.status && (
                <div className="absolute bottom-2 right-2 bg-black/40 rounded-full p-1">
                  {renderStatusIcon()}
                </div>
              )}
            </div>
          ) : message.type === 'FILE' && message.metadata?.fileUrl && message.metadata?.mimeType?.startsWith('video/') ? (
            /* Video Message - Inline video player with expand option */
            <div
              className={`${message.replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} ${
                isSent
                  ? 'bg-viber-purple rounded-br-sm order-1'
                  : 'bg-gray-100 dark:bg-dark-received-bubble rounded-bl-sm order-2'
              } overflow-hidden`}
            >
              <VideoPlayer
                src={decryptedFileUrl || proxyFileUrl!}
                thumbnailUrl={decryptedFileUrl ? undefined : proxyThumbnailUrl || undefined}
                mimeType={message.metadata.encryption?.originalMimeType || message.metadata.mimeType}
                fileName={message.metadata.fileName}
                isSent={isSent}
                onExpandClick={() => setVideoLightboxOpen(true)}
              />
              {/* Caption if present */}
              {message.content && message.content !== message.metadata.fileName && (
                <div className={`px-3 py-2 text-sm ${isSent ? 'text-white' : 'text-gray-900'}`}>
                  {message.content}
                </div>
              )}
              {/* Status for sent videos */}
              {isSent && message.status && (
                <div
                  className={`flex items-center gap-1 px-3 pb-2 text-[11px] ${
                    isSent ? 'text-white/70 justify-end' : 'text-gray-500 justify-start'
                  }`}
                >
                  {message.isEdited && <span>(edited)</span>}
                  {renderStatusIcon()}
                </div>
              )}
            </div>
          ) : message.type === 'FILE' && message.metadata?.fileUrl ? (
            /* File Message - Click file info to view, click download icon to download, right-click for menu */
            <div
              className={`px-3 md:px-4 py-3 ${message.replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} ${
                isSent
                  ? 'bg-viber-purple text-white rounded-br-sm order-1'
                  : 'bg-gray-100 dark:bg-dark-received-bubble text-gray-900 dark:text-dark-text rounded-bl-sm order-2'
              } transition-all min-w-[200px] max-w-xs`}
            >
              <div className="flex items-center gap-3">
                {/* Clickable file info area - opens file in new tab */}
                <div
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Open file in new tab - browser handles viewing (PDFs show inline, others download)
                    window.open(decryptedFileUrl || message.metadata?.fileUrl, '_blank', 'noopener,noreferrer');
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e);
                  }}
                  title="Click to open file"
                >
                  {/* File icon */}
                  <div className={`flex-shrink-0 p-2 rounded-lg ${isSent ? 'bg-white/20' : 'bg-white'}`}>
                    {getFileIcon(message.metadata.mimeType)}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={message.metadata.fileName}>
                      {message.metadata.fileName}
                    </p>
                    <p className={`text-xs ${isSent ? 'text-white/70' : 'text-gray-500'}`}>
                      {formatFileSize(message.metadata.fileSize)}
                    </p>
                  </div>
                </div>

                {/* Download button - separate action */}
                <button
                  className={`flex-shrink-0 p-2 rounded-full transition ${
                    isSent ? 'hover:bg-white/20' : 'hover:bg-gray-200'
                  }`}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      // E2EE: use the already-decrypted blob URL directly
                      // Non-E2EE: fetch through proxy (token in URL, no CORS issue)
                      let downloadUrl: string;
                      let isBlobCreated = false;
                      if (decryptedFileUrl) {
                        downloadUrl = decryptedFileUrl;
                      } else if (proxyFileUrl) {
                        const res = await fetch(proxyFileUrl);
                        const blob = await res.blob();
                        downloadUrl = window.URL.createObjectURL(blob);
                        isBlobCreated = true;
                      } else {
                        return;
                      }
                      const link = document.createElement('a');
                      link.href = downloadUrl;
                      link.download = message.metadata?.fileName || 'file';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      if (isBlobCreated) window.URL.revokeObjectURL(downloadUrl);
                    } catch {
                      if (proxyFileUrl) window.open(proxyFileUrl, '_blank');
                    }
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e);
                  }}
                  title="Download file"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>

              {/* Status */}
              {(message.isEdited || message.status) && (
                <div
                  className={`flex items-center gap-1 mt-2 text-[11px] ${
                    isSent ? 'text-white/70 justify-end' : 'text-gray-500 justify-start'
                  }`}
                >
                  {message.isEdited && <span>(edited)</span>}
                  {renderStatusIcon()}
                </div>
              )}
            </div>
          ) : message.type === 'VOICE' && message.metadata?.fileUrl ? (
            /* Voice Message - Messenger style with waveform */
            <div
              className={`px-3 py-2.5 ${message.replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} ${
                isSent
                  ? 'bg-viber-purple text-white rounded-br-sm order-1'
                  : 'bg-gray-100 dark:bg-dark-received-bubble text-gray-900 dark:text-dark-text rounded-bl-sm order-2'
              } transition-all`}
            >
              <VoiceMessagePlayer
                src={decryptedFileUrl || message.metadata.fileUrl}
                duration={message.metadata.duration}
                isSent={isSent}
                fileName={message.metadata.fileName}
              />

              {/* Status indicator */}
              {isSent && (
                <div
                  className={`flex items-center justify-end mt-1 text-[11px] ${
                    isSent ? 'text-white/70' : 'text-gray-500'
                  }`}
                >
                  {message.isEdited && <span className="mr-1">(edited)</span>}
                  {renderStatusIcon()}
                </div>
              )}
            </div>
          ) : (
            /* Regular Text Message */
            <div
              className={`px-3 md:px-4 py-2 md:py-2.5 ${message.replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} ${
                isSent
                  ? 'bg-viber-purple text-white rounded-br-sm order-1'
                  : 'bg-gray-100 dark:bg-dark-received-bubble text-gray-900 dark:text-dark-text rounded-bl-sm order-2'
              } ${message.status === 'failed' ? 'opacity-60' : ''} ${
                isSearchHighlighted ? 'ring-2 ring-yellow-400 dark:ring-yellow-500/60 bg-yellow-50 dark:bg-yellow-400/10' : ''
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

        {/* Image Lightbox */}
        {lightboxOpen && message.type === 'IMAGE' && proxyFileUrl && message.metadata && (
          <ImageLightbox
            images={[{
              url: decryptedFileUrl || proxyFileUrl,
              thumbnailUrl: decryptedFileUrl ? undefined : proxyThumbnailUrl || undefined,
              fileName: message.metadata.fileName,
              caption: message.content !== message.metadata.fileName ? message.content : undefined,
            }]}
            initialIndex={0}
            onClose={() => setLightboxOpen(false)}
          />
        )}

        {/* Video Lightbox */}
        {videoLightboxOpen && message.type === 'FILE' && proxyFileUrl && (message.metadata?.mimeType?.startsWith('video/') || message.metadata?.encryption?.originalMimeType?.startsWith('video/')) && (
          <VideoLightbox
            src={decryptedFileUrl || proxyFileUrl}
            mimeType={message.metadata.encryption?.originalMimeType || message.metadata.mimeType}
            fileName={message.metadata.fileName}
            thumbnailUrl={decryptedFileUrl ? undefined : proxyThumbnailUrl || undefined}
            onClose={() => setVideoLightboxOpen(false)}
          />
        )}

        {/* Timestamp: shown on hover (desktop) or single tap (mobile) */}
        {showTimestamp && (
          <div className={`text-[10px] text-gray-400 dark:text-dark-text-secondary mt-1 px-1 ${isSent ? 'text-right' : 'text-left'}`}>
            {formatMessageTimestamp(message.createdAt)}
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
                      ? 'bg-white dark:bg-dark-surface border-viber-purple text-viber-purple font-semibold'
                      : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border text-gray-700 dark:text-dark-text border-gray-200 dark:border-dark-border'
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
          className="fixed z-50 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-dark-border py-1 min-w-[160px] max-w-[200px] sm:max-w-none"
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
                    <button className="w-full px-4 py-2 justify-start text-sm md:text-base hover:bg-gray-100 dark:hover:bg-dark-border flex items-center gap-2 text-gray-700 dark:text-dark-text transition rounded-none h-auto">
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
                  triggerClassName="w-full px-4 py-2 justify-start text-sm md:text-base hover:bg-gray-100 dark:hover:bg-dark-border flex items-center gap-2 text-gray-700 dark:text-dark-text transition rounded-none h-auto"
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
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-gray-100 dark:hover:bg-dark-border flex items-center gap-2 text-gray-700 dark:text-dark-text transition"
            >
              <Reply className="w-4 h-4 md:w-5 md:h-5" />
              Reply
            </button>
          )}

          {/* Copy — for text messages (uses decrypted plaintext if E2EE) */}
          {message.type === 'TEXT' && !message.deletedAt && (
            <button
              onClick={() => handleMenuAction(() => {
                const text = decryptedContentCache.get(message.id) ?? message.content;
                if (text) navigator.clipboard.writeText(text).catch(() => {});
              })}
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-gray-100 dark:hover:bg-dark-border flex items-center gap-2 text-gray-700 dark:text-dark-text transition"
            >
              <Copy className="w-4 h-4 md:w-5 md:h-5" />
              Copy
            </button>
          )}

          {/* Edit - only for own messages and not deleted (system messages already returned early) */}
          {currentUserId && message.senderId === currentUserId && onEdit && !message.deletedAt && (
            <button
              onClick={() => handleMenuAction(() => onEdit(message.id))}
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-gray-100 dark:hover:bg-dark-border flex items-center gap-2 text-gray-700 dark:text-dark-text transition"
            >
              <Edit className="w-4 h-4 md:w-5 md:h-5" />
              Edit
            </button>
          )}

          {/* Delete for Me - available for ALL messages (own and others) - but not already deleted */}
          {onDelete && !message.deletedAt && (
            <button
              onClick={() => handleMenuAction(() => onDelete(message.id, 'me'))}
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-gray-100 dark:hover:bg-dark-border flex items-center gap-2 text-gray-700 dark:text-dark-text transition"
            >
              <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              Delete for Me
            </button>
          )}

          {/* Delete for Everyone - only for own messages, not already deleted, and within 48 hours */}
          {currentUserId && message.senderId === currentUserId && onDelete && !message.deletedAt && canDeleteForEveryone && (
            <button
              onClick={() => handleMenuAction(() => onDelete(message.id, 'everyone'))}
              className="w-full px-4 py-2 text-left text-sm md:text-base hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-red-600 dark:text-red-400 transition"
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
          className="fixed z-50 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-dark-border p-3 md:p-4"
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
