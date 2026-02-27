/**
 * MessageList Component
 * Scrollable message container with Messenger-style time separators and auto-scroll.
 * Uses react-window List for DOM virtualization (60fps at 1000+ messages).
 */

'use client';

import { log } from '@/lib/logger';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  memo,
  useMemo,
  useCallback,
  CSSProperties,
} from 'react';
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight } from 'react-window';
import { formatTimeSeparator, parseTimestamp } from '@/lib/dateUtils';
import { MessageBubble } from './MessageBubble';
import { ImageLightbox, type LightboxImage } from './ImageLightbox';
import { Loader2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Message } from '@/types/message';
import { getApiBaseUrl, STORAGE_KEYS } from '@/lib/constants';

/** Build a proxy URL for an OSS asset (mirrors the helper in MessageBubble). */
function ossProxyUrl(ossUrl: string): string {
  const token = typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '') : '';
  const params = new URLSearchParams({ url: ossUrl });
  if (token) params.set('token', token);
  return `${getApiBaseUrl()}/files/proxy?${params.toString()}`;
}

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  isFetchingNextPage?: boolean;
  hasMore: boolean;
  currentUserId: string;
  conversationId?: string;
  onLoadMore?: () => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onReply?: (message: Message) => void;
  onJumpToReply?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
  isGroupChat?: boolean;
  highlightedMessageId?: string | null;
  registerMessageRef?: (messageId: string, element: HTMLElement | null) => void;
  searchQuery?: string;
  searchHighlightId?: string | null;
}

/**
 * MessageItem - Wrapper component for consistent message rendering.
 * Note: Read tracking is now handled at conversation level (Messenger-style).
 */
interface MessageItemProps {
  message: Message;
  isSent: boolean;
  showSender: boolean;
  senderName?: string;
  currentUserId: string;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onReply?: (message: Message) => void;
  onJumpToReply?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
  searchQuery?: string;
  isHighlighted: boolean;
  isSearchHighlighted: boolean;
  onOpenMediaLightbox?: (messageId: string) => void;
}

const MessageItem = memo(function MessageItem({
  message,
  isSent,
  showSender,
  senderName,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onJumpToReply,
  onReact,
  getUserName,
  searchQuery,
  isHighlighted,
  isSearchHighlighted,
  onOpenMediaLightbox,
}: MessageItemProps) {
  return (
    <div className="transition-all duration-300">
      <MessageBubble
        message={message}
        isSent={isSent}
        showSender={showSender}
        senderName={senderName}
        currentUserId={currentUserId}
        onEdit={isSent ? onEdit : undefined}
        onDelete={onDelete}
        onReply={onReply}
        onJumpToReply={onJumpToReply}
        onReact={onReact}
        getUserName={getUserName}
        searchQuery={searchQuery}
        isHighlighted={isHighlighted}
        isSearchHighlighted={isSearchHighlighted}
        onOpenMediaLightbox={onOpenMediaLightbox}
      />
    </div>
  );
});

/** Estimated row height by message type — used as defaultRowHeight for useDynamicRowHeight */
function estimateHeight(message: Message, hasTimeSeparator: boolean): number {
  let base: number;
  switch (message.type) {
    case 'IMAGE':
      base = 220;
      break;
    case 'FILE':
      base = 100;
      break;
    case 'POLL':
      base = 200;
      break;
    case 'VOICE':
      base = 80;
      break;
    default:
      base = 72;
  }
  // Add space for reaction overflow and inter-row gap
  if (message.reactions && message.reactions.length > 0) base += 28;
  base += 8;
  return hasTimeSeparator ? base + 32 : base;
}

/** Per-row render props passed via rowProps */
interface RowData {
  validMessages: Message[];
  itemMeta: ItemMeta[];
  highlightedMessageId: string | null;
  searchHighlightId?: string | null;
  currentUserId: string;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string, scope: 'me' | 'everyone') => void;
  onReply?: (message: Message) => void;
  onJumpToReply?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  getUserName?: (userId: string) => string;
  searchQuery?: string;
  registerMessageRef?: (messageId: string, element: HTMLElement | null) => void;
  observeRowElements: (elements: Element[] | NodeListOf<Element>) => () => void;
  onOpenMediaLightbox?: (messageId: string) => void;
}

interface ItemMeta {
  isSent: boolean;
  showSender: boolean;
  showTimeSeparator: boolean;
  timeSeparatorText: string;
}

function RowRenderer({
  index,
  style,
  validMessages,
  itemMeta,
  highlightedMessageId,
  searchHighlightId,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onJumpToReply,
  onReact,
  getUserName,
  searchQuery,
  registerMessageRef,
  observeRowElements,
  onOpenMediaLightbox,
}: RowComponentProps<RowData>) {
  const message = validMessages[index];
  const meta = itemMeta[index];
  if (!message || !meta) return null;

  const { isSent, showSender, showTimeSeparator, timeSeparatorText } = meta;
  const isHighlighted = highlightedMessageId === message.id;
  const isSearchHighlighted = searchHighlightId === message.id;

  return (
    <div style={style as CSSProperties}>
      <div
        className="pb-2"
        data-react-window-index={index}
        ref={(el) => {
          registerMessageRef?.(message.id, el);
          if (el) observeRowElements([el]);
        }}
      >
        {showTimeSeparator && (
          <div className="flex items-center justify-center py-2">
            <span className="text-[11px] text-gray-400">{timeSeparatorText}</span>
          </div>
        )}
        <MessageItem
          message={message}
          isSent={isSent}
          showSender={showSender}
          senderName={getUserName ? getUserName(message.senderId) : undefined}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
          onReply={onReply}
          onJumpToReply={onJumpToReply}
          onReact={onReact}
          getUserName={getUserName}
          searchQuery={searchQuery}
          isHighlighted={isHighlighted}
          isSearchHighlighted={isSearchHighlighted}
          onOpenMediaLightbox={onOpenMediaLightbox}
        />
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  loading,
  isFetchingNextPage = false,
  hasMore,
  currentUserId,
  conversationId,
  onLoadMore,
  onEdit,
  onDelete,
  onReply,
  onJumpToReply,
  onReact,
  getUserName,
  isGroupChat = false,
  highlightedMessageId = null,
  registerMessageRef,
  searchQuery,
  searchHighlightId,
}: MessageListProps) {
  const listRef = useRef<ListImperativeAPI | null>(null);

  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Connected lightbox — owned here so all media in the conversation can be navigated.
  // Messenger/Telegram pattern: clicking any image/video opens a single lightbox
  // with left/right arrows to browse all conversation media (latest ↔ oldest).
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const previousMessageCountRef = useRef(messages?.length || 0);
  const previousScrollTopRef = useRef(0);
  const previousScrollHeightRef = useRef(0);
  const wasFetchingNextPageRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const initialLoadRef = useRef(true);

  // The List component renders into a div — get a ref to the outer element for scroll position
  const outerElRef = useRef<HTMLElement | null>(null);

  // Filter out messages with invalid timestamps
  const validMessages = useMemo(() => {
    return (messages || []).filter((message) => {
      try {
        parseTimestamp(message.createdAt);
        return true;
      } catch {
        log.message.debug('[MessageList] Skipping message with invalid timestamp:', message);
        return false;
      }
    });
  }, [messages]);

  // Pre-compute per-item metadata
  const itemMeta: ItemMeta[] = useMemo(() => {
    return validMessages.map((message, index) => {
      const isSent = message.senderId === currentUserId;
      const previousMessage = validMessages[index - 1];
      const showSender =
        isGroupChat &&
        !isSent &&
        (!previousMessage || previousMessage.senderId !== message.senderId);

      let showTimeSeparator = false;
      let timeSeparatorText = '';
      if (message.createdAt) {
        try {
          if (index === 0) {
            showTimeSeparator = true;
            timeSeparatorText = formatTimeSeparator(message.createdAt);
          } else if (previousMessage?.createdAt) {
            const gapMinutes =
              (new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime()) /
              60000;
            if (gapMinutes >= 20) {
              showTimeSeparator = true;
              timeSeparatorText = formatTimeSeparator(message.createdAt);
            }
          }
        } catch {
          // skip
        }
      }

      return { isSent, showSender, showTimeSeparator, timeSeparatorText };
    });
  }, [validMessages, currentUserId, isGroupChat]);

  // Build the ordered list of media items (images + videos) from current messages.
  // Used for connected lightbox navigation — clicking any media in the conversation
  // opens the lightbox at that item's index, with arrows to navigate all others.
  // Note: validMessages is oldest-first; we keep that order for the lightbox
  // (left = older, right = newer — matches Messenger/Telegram).
  const conversationMediaList = useMemo<LightboxImage[]>(() => {
    return validMessages
      .filter(
        (m) =>
          !m.deletedAt &&
          (m.type === 'IMAGE' ||
            (m.type === 'FILE' &&
              (m.metadata?.mimeType?.startsWith('video/') ||
                m.metadata?.encryption?.originalMimeType?.startsWith('video/'))))
      )
      .map((m) => {
        const isVideo =
          m.type === 'FILE' &&
          (m.metadata?.mimeType?.startsWith('video/') ||
            !!m.metadata?.encryption?.originalMimeType?.startsWith('video/'));
        const fileUrl = m.metadata?.fileUrl ? ossProxyUrl(m.metadata.fileUrl) : '';
        const encMeta = m.metadata?.encryption;
        return {
          id: m.id,
          url: fileUrl,
          fileName: m.metadata?.fileName,
          isVideo,
          mimeType: encMeta?.originalMimeType || m.metadata?.mimeType,
          // For images: pass encMeta so lightbox can decrypt on demand.
          // For videos: skip encMeta — E2EE video decrypt is deferred to play-click.
          encMeta:
            !isVideo && encMeta?.fileKey && encMeta?.fileNonce
              ? { fileKey: encMeta.fileKey, fileNonce: encMeta.fileNonce, originalMimeType: encMeta.originalMimeType }
              : undefined,
          caption: m.content !== m.metadata?.fileName ? m.content || undefined : undefined,
        };
      })
      .filter((item) => item.url);
  }, [validMessages]);

  // Open the connected lightbox at the given message's index within conversationMediaList.
  const handleOpenMediaLightbox = useCallback(
    (messageId: string) => {
      const idx = conversationMediaList.findIndex((item) => item.id === messageId);
      if (idx === -1) return; // Message not in media list — ignore
      setLightboxImages(conversationMediaList);
      setLightboxIndex(idx);
    },
    [conversationMediaList]
  );

  // useDynamicRowHeight — ResizeObserver-based height tracking.
  // observeRowElements fires whenever a row's DOM element resizes (image load,
  // content change, lazy decryption), automatically updating the row slot height
  // in the List. This replaces the broken manual getBoundingClientRect approach
  // which measured once on mount and never updated.
  // key=conversationId resets all cached heights on conversation switch.
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: 80,
    key: conversationId,
  });

  // Build rowHeight function that uses per-message estimates as the default
  // for rows not yet observed by ResizeObserver
  const rowHeight = useCallback(
    (index: number) => {
      const observed = dynamicRowHeight.getRowHeight(index);
      if (observed !== undefined) return observed;
      const msg = validMessages[index];
      if (!msg) return 80;
      return estimateHeight(msg, itemMeta[index]?.showTimeSeparator ?? false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dynamicRowHeight, validMessages, itemMeta]
  );

  // rowProps passed to each row renderer
  const rowProps = useMemo<RowData>(
    () => ({
      validMessages,
      itemMeta,
      highlightedMessageId,
      searchHighlightId,
      currentUserId,
      onEdit,
      onDelete,
      onReply,
      onJumpToReply,
      onReact,
      getUserName,
      searchQuery,
      registerMessageRef,
      observeRowElements: dynamicRowHeight.observeRowElements,
      onOpenMediaLightbox: handleOpenMediaLightbox,
    }),
    [
      validMessages,
      itemMeta,
      highlightedMessageId,
      searchHighlightId,
      currentUserId,
      onEdit,
      onDelete,
      onReply,
      onJumpToReply,
      onReact,
      getUserName,
      searchQuery,
      registerMessageRef,
      dynamicRowHeight.observeRowElements,
      handleOpenMediaLightbox,
    ]
  );

  // Track the outer List element for scroll position reads
  const handleListResize = useCallback(
    (_size: { height: number }) => {
      // Capture outer element ref on first resize
      if (!outerElRef.current && listRef.current) {
        outerElRef.current = listRef.current.element;
      }
    },
    [listRef]
  );

  // After mount, grab the outer element
  useEffect(() => {
    if (listRef.current && !outerElRef.current) {
      outerElRef.current = listRef.current.element;
    }
  }, [listRef]);

  // Preserve scroll position when pagination prepends messages
  useLayoutEffect(() => {
    const outer = outerElRef.current as HTMLElement | null;
    const messageCount = messages?.length || 0;
    const previousCount = previousMessageCountRef.current;

    if (wasFetchingNextPageRef.current && !isFetchingNextPage && messageCount > previousCount && outer) {
      const currentHeight = outer.scrollHeight;
      const diff = currentHeight - previousScrollHeightRef.current;
      if (diff > 0) {
        outer.scrollTop = previousScrollTopRef.current + diff;
      }
    } else if (
      !isFetchingNextPage &&
      !wasFetchingNextPageRef.current &&
      autoScroll &&
      messageCount > previousCount
    ) {
      if (listRef.current) {
        listRef.current.scrollToRow({
          index: validMessages.length - 1,
          align: 'end',
        });
      }
    }

    wasFetchingNextPageRef.current = isFetchingNextPage;
    previousMessageCountRef.current = messageCount;
    if (outer) {
      previousScrollHeightRef.current = outer.scrollHeight;
    }
  }, [messages, isFetchingNextPage, autoScroll, validMessages.length, listRef]);

  // Scroll to bottom on initial load
  useEffect(() => {
    const hasMessages = (messages?.length || 0) > 0;
    if (hasMessages && !loading && initialLoadRef.current) {
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollToRow({
            index: validMessages.length - 1,
            align: 'end',
          });
        }
        initialLoadRef.current = false;
      }, 100);
    }
  }, [messages?.length, loading, validMessages.length, listRef]);

  // Reset initial load flag on conversation change
  useEffect(() => {
    initialLoadRef.current = true;
  }, [conversationId]);

  // Reset loading flag when pagination completes
  useEffect(() => {
    if (!isFetchingNextPage && isLoadingMoreRef.current) {
      isLoadingMoreRef.current = false;
    }
  }, [isFetchingNextPage]);

  // Native scroll handler on the List's outer element
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = distanceFromBottom < 100;
      const isScrollingUp = scrollTop < previousScrollTopRef.current;

      previousScrollTopRef.current = scrollTop;
      setAutoScroll(isAtBottom);
      setShowScrollButton(distanceFromBottom > 100);

      // Load more when near top while scrolling up
      if (
        scrollTop < 100 &&
        isScrollingUp &&
        hasMore &&
        !loading &&
        !isFetchingNextPage &&
        onLoadMore &&
        !isLoadingMoreRef.current
      ) {
        isLoadingMoreRef.current = true;
        previousScrollHeightRef.current = el.scrollHeight;
        previousScrollTopRef.current = scrollTop;
        onLoadMore();
      }
    },
    [hasMore, loading, isFetchingNextPage, onLoadMore]
  );

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollToRow({
        index: validMessages.length - 1,
        align: 'end',
        behavior: 'smooth',
      });
    }
    setAutoScroll(true);
    setShowScrollButton(false);
  }, [validMessages.length, listRef]);

  if (loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="text-center">
          <Loader2 className="w-8 h-8 md:w-10 md:h-10 animate-spin text-viber-purple mx-auto mb-3" />
          <p className="text-gray-500 dark:text-dark-text-secondary text-sm md:text-base">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (!loading && (!messages || messages.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="text-center p-6">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-200 dark:bg-dark-border rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl md:text-4xl">💬</span>
          </div>
          <p className="text-gray-500 dark:text-dark-text-secondary mb-2 text-base md:text-lg">No messages yet</p>
          <p className="text-sm md:text-base text-gray-400 dark:text-dark-text-secondary">
            Start a conversation by sending a message below
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-dark-bg overflow-hidden relative">
      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center py-2 px-3 md:px-4 flex-shrink-0">
          <button
            onClick={() => {
              const outer = outerElRef.current as HTMLElement | null;
              if (outer && onLoadMore && !isLoadingMoreRef.current) {
                isLoadingMoreRef.current = true;
                previousScrollHeightRef.current = outer.scrollHeight;
                onLoadMore();
              }
            }}
            disabled={loading || isFetchingNextPage || isLoadingMoreRef.current}
            className="px-4 py-2 text-sm text-viber-purple hover:bg-viber-purple/10 rounded-full transition disabled:opacity-50"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Loading...
              </>
            ) : (
              'Load older messages'
            )}
          </button>
        </div>
      )}

      {/* Virtualized message list */}
      <div className="flex-1 min-h-0 px-3 md:px-4">
        <List
          listRef={listRef}
          rowCount={validMessages.length}
          rowHeight={rowHeight}
          rowComponent={RowRenderer}
          rowProps={rowProps}
          overscanCount={5}
          onResize={handleListResize}
          onScroll={handleScroll}
          style={{ overflowX: 'hidden' }}
          className="w-full"
        />
      </div>

      {/* Scroll to Bottom Button - Telegram/Messenger Pattern */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={scrollToBottom}
            className="absolute bottom-6 right-6 z-40 w-12 h-12 md:w-14 md:h-14 bg-viber-purple hover:bg-viber-purple-dark text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="w-6 h-6 md:w-7 md:h-7" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Connected conversation lightbox — portals to #lightbox-root outside dialog stack */}
      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
        />
      )}
    </div>
  );
}
