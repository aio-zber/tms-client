/**
 * useConversations Hook
 * Manages conversation list fetching and state with real-time WebSocket updates.
 *
 * Real-time strategy (Telegram pattern):
 * - Server auto-joins ALL conversation rooms on connect (one DB query)
 * - Client only listens for events — no per-room join calls needed
 * - DIRECT CACHE UPDATE (setQueryData) for instant sidebar rendering
 * - Background invalidation as fallback to sync with server truth
 */

import { log } from '@/lib/logger';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { queryKeys } from '@/lib/queryClient';
import { useConversationsQuery } from './useConversationsQuery';
import { useSocketReady } from '@/components/providers/SocketProvider';
import { decryptedContentCache } from '@/features/messaging/hooks/useMessages';
import { useUserStore } from '@/store/userStore';
import type { Conversation, ConversationType, ConversationListResponse } from '@/types/conversation';

interface UseConversationsOptions {
  limit?: number;
  type?: ConversationType;
  autoLoad?: boolean;
}

/**
 * Directly update the conversation list cache when a new message arrives.
 * Updates lastMessage, bumps conversation to top, and increments unreadCount.
 * This mirrors the instant cache update pattern from useMessages.ts.
 */
function updateConversationCacheWithNewMessage(
  oldData: unknown,
  conversationId: string,
  message: Record<string, unknown>,
  _isOwnMessage: boolean
): unknown {
  if (!oldData || typeof oldData !== 'object') return oldData;

  const data = oldData as {
    pages: Array<ConversationListResponse>;
    pageParams: unknown[];
  };

  if (!data.pages || data.pages.length === 0) return oldData;

  // Build the new lastMessage from the WebSocket payload
  // Backend sends snake_case; the Conversation type uses mixed casing
  const isEncrypted = !!(message.encrypted);
  const rawContent = (message.content as string) || '';
  const messageId = (message.id as string) || '';

  // Use decrypted content from cache if available (so sidebar shows plaintext)
  const cachedDecrypted = messageId ? decryptedContentCache.get(messageId) : undefined;
  const displayContent = cachedDecrypted ?? rawContent;

  const newLastMessage = {
    id: messageId || undefined,
    content: displayContent,
    senderId: (message.sender_id || message.senderId) as string,
    timestamp: (message.created_at || message.createdAt) as string,
    // Mark as encrypted only when no decrypted content is available
    encrypted: isEncrypted && !cachedDecrypted,
  };

  // Find the conversation across all pages and extract it
  let targetConversation: Conversation | null = null;
  let targetPageIndex = -1;
  let targetConvIndex = -1;

  for (let pi = 0; pi < data.pages.length; pi++) {
    const page = data.pages[pi];
    for (let ci = 0; ci < page.data.length; ci++) {
      if (page.data[ci].id === conversationId) {
        targetConversation = page.data[ci];
        targetPageIndex = pi;
        targetConvIndex = ci;
        break;
      }
    }
    if (targetConversation) break;
  }

  if (!targetConversation) {
    // Conversation not in cache — let invalidation handle it
    return oldData;
  }

  // Create updated conversation (immutable — new object).
  // Do NOT optimistically increment unreadCount here — that causes inflation
  // when combined with the server refetch that follows. The server tracks
  // unread counts accurately via last_read_at; we rely on that as the source
  // of truth and invalidate the query to get the fresh value.
  const updatedConversation: Conversation = {
    ...targetConversation,
    lastMessage: newLastMessage,
    updatedAt: newLastMessage.timestamp,
    unreadCount: targetConversation.unreadCount,
  };

  // Build new pages: remove conversation from its current position,
  // then prepend it to the first page (Viber/Messenger: most recent at top)
  const newPages = data.pages.map((page, pi) => {
    if (pi === 0 && pi === targetPageIndex) {
      // Conversation is on the first page — remove and prepend
      const filtered = page.data.filter((_, ci) => ci !== targetConvIndex);
      return { ...page, data: [updatedConversation, ...filtered] };
    }
    if (pi === 0) {
      // Prepend to first page
      return { ...page, data: [updatedConversation, ...page.data] };
    }
    if (pi === targetPageIndex) {
      // Remove from original page
      return { ...page, data: page.data.filter((_, ci) => ci !== targetConvIndex) };
    }
    return page;
  });

  return { ...data, pages: newPages };
}

/**
 * Patch the sidebar conversation list cache to show decrypted content for own sent messages.
 * Called from Chat.tsx after send completes — at that point cacheDecryptedContent has been
 * populated, so the sidebar shows the plaintext immediately instead of "Encrypted Message".
 */
export function patchSidebarLastMessageContent(
  queryClient: import('@tanstack/react-query').QueryClient,
  conversationId: string,
  messageId: string,
  decryptedContent: string,
  limit: number = 20
): void {
  const listQueryKey = queryKeys.conversations.list({ limit, offset: 0, type: undefined });
  queryClient.setQueryData(
    listQueryKey,
    (oldData: unknown) => {
      if (!oldData || typeof oldData !== 'object') return oldData;
      const data = oldData as { pages: Array<{ data: Conversation[] }>; pageParams: unknown[] };
      if (!data.pages) return oldData;
      const newPages = data.pages.map((page) => ({
        ...page,
        data: page.data.map((conv) => {
          if (conv.id !== conversationId) return conv;
          if (!conv.lastMessage || conv.lastMessage.id !== messageId) return conv;
          return {
            ...conv,
            lastMessage: { ...conv.lastMessage, content: decryptedContent, encrypted: false },
          };
        }),
      }));
      return { ...data, pages: newPages };
    }
  );
}

// ==================== Singleton Socket Manager ====================
// useConversations is mounted in multiple components (ConversationList, UserProfileDialog).
// If each instance registers its own socket.on('new_message') listener, Socket.IO
// accumulates them — N instances × 1 message = N unread increments.
//
// Solution: a module-level singleton that registers exactly ONE socket listener
// and fans out to all active hook instances via a Set of callbacks.
// When the last instance unmounts, the socket listener is removed.

type NewMessageCallback = (message: Record<string, unknown>) => void;
type MessageStatusCallback = (data: Record<string, unknown>) => void;
type ConversationUpdatedCallback = (data: Record<string, unknown>) => void;

const newMessageCallbacks = new Set<NewMessageCallback>();
const messageStatusCallbacks = new Set<MessageStatusCallback>();
const conversationUpdatedCallbacks = new Set<ConversationUpdatedCallback>();

// The actual socket handlers — registered once, fan out to all hook instances
const socketNewMessageHandler = (message: Record<string, unknown>) => {
  newMessageCallbacks.forEach(cb => cb(message));
};
const socketMessageStatusHandler = (data: Record<string, unknown>) => {
  messageStatusCallbacks.forEach(cb => cb(data));
};
const socketConversationUpdatedHandler = (data: Record<string, unknown>) => {
  conversationUpdatedCallbacks.forEach(cb => cb(data));
};

let socketListenersActive = false;

function registerSocketListeners() {
  if (socketListenersActive) return;
  socketListenersActive = true;
  socketClient.onNewMessage(socketNewMessageHandler);
  socketClient.onMessageStatus(socketMessageStatusHandler);
  socketClient.onConversationUpdated(socketConversationUpdatedHandler);
  log.message.debug('[useConversations] Singleton socket listeners registered');
}

function unregisterSocketListeners() {
  socketListenersActive = false;
  socketClient.off('new_message', socketNewMessageHandler);
  socketClient.off('message_status', socketMessageStatusHandler);
  socketClient.off('conversation_updated', socketConversationUpdatedHandler);
  log.message.debug('[useConversations] Singleton socket listeners removed');
}

// ==================== Hook ====================

export function useConversations(
  options: UseConversationsOptions = {}
) {
  const { limit = 20, type, autoLoad = true } = options;
  const queryClient = useQueryClient();
  const socketReady = useSocketReady();

  // Use TanStack Query infinite query
  const {
    conversations,
    isLoading,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useConversationsQuery({
    limit,
    type,
    enabled: autoLoad,
  });

  // WebSocket listeners for real-time sidebar updates.
  //
  // Telegram pattern: Server auto-joins ALL conversation rooms on connect
  // (one DB query in the connect handler). The client only needs to listen
  // for events — no per-room join_conversation calls from the sidebar.
  //
  // join_conversation is still called by useMessages when the user OPENS
  // a specific chat, which triggers mark-as-read on the server.
  useEffect(() => {
    if (!socketReady) return;

    log.message.debug('[useConversations] Attaching instance callbacks');

    // Read synchronously from the Zustand store — already populated at login,
    // no async gap that could misidentify own messages as foreign.
    const getCurrentUserId = () => useUserStore.getState().currentUser?.id ?? null;

    // On reconnect, server auto-rejoins all rooms. Just refresh data
    // to catch any messages missed during disconnection.
    const handleConnect = () => {
      log.ws.info('[useConversations] Socket reconnected — refreshing data');
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    };

    const socket = socketClient.getSocket();
    socket?.on('connect', handleConnect);

    const listQueryKey = queryKeys.conversations.list({ limit, offset: 0, type });

    // Per-instance new_message handler — runs inside the singleton fan-out
    const handleNewMessage = (message: Record<string, unknown>) => {
      const conversationId = (message.conversation_id || message.conversationId) as string;
      const senderId = (message.sender_id || message.senderId) as string;
      const messageId = (message.id as string) || '';

      if (!conversationId) return;

      const isOwnMessage = senderId === getCurrentUserId();
      const isEncrypted = !!(message.encrypted);

      // INSTANT UPDATE: Directly update the conversation cache
      queryClient.setQueryData(
        listQueryKey,
        (oldData: unknown) => {
          if (!oldData) return oldData;
          return updateConversationCacheWithNewMessage(oldData, conversationId, message, isOwnMessage);
        }
      );

      // For encrypted messages: attempt async decryption so the sidebar shows
      // the plaintext preview instead of the encrypted placeholder.
      if (isEncrypted && messageId) {
        const rawContent = (message.content as string) || '';
        const metadataJson = message.metadata_json as Record<string, unknown> | undefined;
        const encMeta = metadataJson?.encryption as Record<string, unknown> | undefined;
        const x3dhHeaderRaw = encMeta?.x3dhHeader as string | undefined;
        // senderKeyId is the primary group indicator (non-null only for group E2EE).
        const isGroup = !!(message.sender_key_id || message.senderKeyId || encMeta?.isGroup);

        // Only update lastMessage.content in-place — do NOT re-run the full
        // updateConversationCacheWithNewMessage which would double-increment unreadCount
        // and re-sort the conversation list.
        const patchSidebarWithDecrypted = (decryptedContent: string) => {
          queryClient.setQueryData(
            listQueryKey,
            (oldData: unknown) => {
              if (!oldData || typeof oldData !== 'object') return oldData;
              const data = oldData as { pages: Array<{ data: Conversation[] }>; pageParams: unknown[] };
              if (!data.pages) return oldData;
              const newPages = data.pages.map((page) => ({
                ...page,
                data: page.data.map((conv) => {
                  if (conv.id !== conversationId) return conv;
                  if (!conv.lastMessage) return conv;
                  return {
                    ...conv,
                    lastMessage: { ...conv.lastMessage, content: decryptedContent, encrypted: false },
                  };
                }),
              }));
              return { ...data, pages: newPages };
            }
          );
        };

        import('@/features/encryption').then(async ({ encryptionService }) => {
          if (!encryptionService.isInitialized()) return;

          if (isOwnMessage) {
            await new Promise((r) => setTimeout(r, 200));
            const { cacheDecryptedContent, decryptedContentCache: cache } = await import('@/features/messaging/hooks/useMessages');
            const cached = cache.get(messageId);
            if (cached) {
              patchSidebarWithDecrypted(cached);
              return;
            }
            if (!isGroup) {
              try {
                const decryptedContent = await encryptionService.decryptOwnDirectMessage(conversationId, rawContent);
                cacheDecryptedContent(messageId, decryptedContent, conversationId);
                patchSidebarWithDecrypted(decryptedContent);
              } catch {
                // No backup available yet — sidebar will show placeholder until send path caches it
              }
            }
            return;
          }

          // For received messages: check cache first (useMessages may have already decrypted)
          // This prevents double-advancing the group chain key on the same message.
          const { cacheDecryptedContent, decryptedContentCache: rcvCache } = await import('@/features/messaging/hooks/useMessages');
          const alreadyDecrypted = messageId ? rcvCache.get(messageId) : undefined;
          if (alreadyDecrypted) {
            patchSidebarWithDecrypted(alreadyDecrypted);
            return;
          }

          try {
            let decryptedContent: string;
            if (isGroup) {
              decryptedContent = await encryptionService.decryptGroupMessageContent(conversationId, senderId, rawContent);
            } else {
              const header = x3dhHeaderRaw ? encryptionService.deserializeX3DHHeader(x3dhHeaderRaw) : undefined;
              decryptedContent = await encryptionService.decryptDirectMessage(conversationId, senderId, rawContent, header);
            }

            cacheDecryptedContent(messageId, decryptedContent, conversationId);
            patchSidebarWithDecrypted(decryptedContent);
          } catch {
            // Decryption failed — keep the encrypted placeholder, no retry
          }
        }).catch(() => {});
      }

      // Update unread counts for messages from others
      if (!isOwnMessage) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }

      // Background sync: invalidate to reconcile with server.
      // Skip for encrypted messages — server's last_message still contains raw ciphertext.
      if (!isEncrypted) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.all,
        });
      }
    };

    // Per-instance message status handler
    const handleMessageStatus = (data: Record<string, unknown>) => {
      const status = data.status as string;
      const conversationId = data.conversation_id as string;
      const userId = data.user_id as string;

      if (status === 'read' && userId === getCurrentUserId() && conversationId) {
        queryClient.setQueryData(
          listQueryKey,
          (oldData: unknown) => {
            if (!oldData || typeof oldData !== 'object') return oldData;
            const typedData = oldData as {
              pages: Array<ConversationListResponse>;
              pageParams: unknown[];
            };
            if (!typedData.pages) return oldData;

            const newPages = typedData.pages.map((page) => ({
              ...page,
              data: page.data.map((conv) =>
                conv.id === conversationId
                  ? { ...conv, unreadCount: 0 }
                  : conv
              ),
            }));
            return { ...typedData, pages: newPages };
          }
        );

        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }
    };

    // Per-instance conversation updated handler
    const handleConversationUpdated = (data: Record<string, unknown>) => {
      const conversationId = data.conversation_id as string;
      log.message.debug('[useConversations] Conversation updated:', conversationId);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    };

    // Register this instance's callbacks into the singleton fan-out sets
    newMessageCallbacks.add(handleNewMessage);
    messageStatusCallbacks.add(handleMessageStatus);
    conversationUpdatedCallbacks.add(handleConversationUpdated);

    // Ensure the singleton socket listeners are active
    registerSocketListeners();

    return () => {
      log.message.debug('[useConversations] Removing instance callbacks');
      newMessageCallbacks.delete(handleNewMessage);
      messageStatusCallbacks.delete(handleMessageStatus);
      conversationUpdatedCallbacks.delete(handleConversationUpdated);
      socket?.off('connect', handleConnect);

      // If no more hook instances are active, remove the socket listeners entirely
      if (newMessageCallbacks.size === 0) {
        unregisterSocketListeners();
      }
    };
  }, [queryClient, socketReady, limit, type]);

  return {
    conversations,
    loading: isLoading,
    error: error as Error | null,
    hasMore: hasNextPage ?? false,
    loadConversations: refetch,
    loadMore: fetchNextPage,
    refresh: refetch,
  };
}
