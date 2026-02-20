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
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { authService } from '@/features/auth/services/authService';
import { queryKeys } from '@/lib/queryClient';
import { useConversationsQuery } from './useConversationsQuery';
import { useSocketReady } from '@/components/providers/SocketProvider';
import { decryptedContentCache } from '@/features/messaging/hooks/useMessages';
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
  isOwnMessage: boolean
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

  // Create updated conversation (immutable — new object)
  const updatedConversation: Conversation = {
    ...targetConversation,
    lastMessage: newLastMessage,
    updatedAt: newLastMessage.timestamp,
    // Increment unread count for messages from other users
    unreadCount: isOwnMessage
      ? targetConversation.unreadCount
      : targetConversation.unreadCount + 1,
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

export function useConversations(
  options: UseConversationsOptions = {}
) {
  const { limit = 20, type, autoLoad = true } = options;
  const queryClient = useQueryClient();
  const socketReady = useSocketReady();

  // Track whether WS listeners are currently attached to prevent duplicates.
  // socketReady can toggle false→true multiple times (reconnects), but we must
  // only call socket.on() once per mount — Socket.IO accumulates listeners.
  const listenersAttachedRef = useRef(false);

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
    if (!socketReady || listenersAttachedRef.current) return;

    listenersAttachedRef.current = true;
    log.message.debug('[useConversations] Attaching WebSocket listeners');

    let currentUserId: string | null = null;

    const initializeUser = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        currentUserId = currentUser?.id || null;
      } catch (err) {
        log.message.warn('[useConversations] Failed to get current user:', err);
      }
    };

    initializeUser();

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

    // Listen for new messages — direct cache update for instant sidebar rendering
    const handleNewMessage = (message: Record<string, unknown>) => {
      const conversationId = (message.conversation_id || message.conversationId) as string;
      const senderId = (message.sender_id || message.senderId) as string;
      const messageId = (message.id as string) || '';

      if (!conversationId) return;

      const isOwnMessage = senderId === currentUserId;
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
      // Only for received messages (own messages are cached at send time).
      if (isEncrypted && messageId) {
        const rawContent = (message.content as string) || '';
        const metadataJson = message.metadata_json as Record<string, unknown> | undefined;
        const encMeta = metadataJson?.encryption as Record<string, unknown> | undefined;
        const x3dhHeaderRaw = encMeta?.x3dhHeader as string | undefined;
        // senderKeyId is the primary group indicator (non-null only for group E2EE).
        // encMeta.isGroup is a secondary fallback set by the client at send time.
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

          // For own messages: use cache (populated at send time) or decrypt via key backup.
          // The WS event may fire before useSendMessage caches the plaintext (race condition),
          // so we retry once after a short delay for the cache, then fall back to decryption.
          if (isOwnMessage) {
            // Short wait for send path to cache the plaintext
            await new Promise((r) => setTimeout(r, 200));
            const { cacheDecryptedContent, decryptedContentCache: cache } = await import('@/features/messaging/hooks/useMessages');
            const cached = cache.get(messageId);
            if (cached) {
              patchSidebarWithDecrypted(cached);
              return;
            }
            // Cache miss even after delay (e.g. new device) — decrypt own DM message
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

          // For received messages: decrypt normally
          try {
            let decryptedContent: string;
            if (isGroup) {
              decryptedContent = await encryptionService.decryptGroupMessageContent(conversationId, senderId, rawContent);
            } else {
              const header = x3dhHeaderRaw ? encryptionService.deserializeX3DHHeader(x3dhHeaderRaw) : undefined;
              decryptedContent = await encryptionService.decryptDirectMessage(conversationId, senderId, rawContent, header);
            }

            const { cacheDecryptedContent } = await import('@/features/messaging/hooks/useMessages');
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
      // IMPORTANT: Skip for encrypted messages — the server's last_message still
      // contains raw ciphertext (encrypted: true). Invalidating here would trigger
      // a refetch that overwrites the decrypted sidebar preview we just patched in.
      // The decrypted patch from setQueryData above is the source of truth.
      if (!isEncrypted) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.all,
        });
      }
    };

    // Listen for message status updates (when messages are read)
    const handleMessageStatus = (data: Record<string, unknown>) => {
      const status = data.status as string;
      const conversationId = data.conversation_id as string;
      const userId = data.user_id as string;

      if (status === 'read' && userId === currentUserId && conversationId) {
        // Reset unread count to 0 instantly when current user marks as read
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

    // Listen for conversation updated events (name/avatar changes)
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

    socketClient.onNewMessage(handleNewMessage);
    socketClient.onMessageStatus(handleMessageStatus);
    socketClient.onConversationUpdated(handleConversationUpdated);

    return () => {
      log.message.debug('[useConversations] Cleaning up WebSocket listeners');
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_status', handleMessageStatus);
      socketClient.off('conversation_updated', handleConversationUpdated);
      socket?.off('connect', handleConnect);
      listenersAttachedRef.current = false;
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
