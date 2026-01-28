/**
 * useConversations Hook
 * Manages conversation list fetching and state with real-time WebSocket updates.
 *
 * Real-time strategy (same as useMessages):
 * - Join ALL conversation rooms so WebSocket events are received for every chat
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
  const newLastMessage = {
    content: (message.content as string) || '',
    senderId: (message.sender_id || message.senderId) as string,
    timestamp: (message.created_at || message.createdAt) as string,
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

  // Track which conversation rooms we've already joined to avoid re-joining
  const joinedRoomsRef = useRef<Set<string>>(new Set());

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

  // SINGLE EFFECT: Join rooms + attach listeners (mirrors useMessages pattern)
  //
  // Critical: Room joining and listener attachment MUST be in the same effect.
  // Socket.IO broadcasts new_message to rooms — if listeners are attached
  // before rooms are joined, events are never received.
  //
  // useMessages (chatbox) works because it joins the room and attaches
  // listeners in one effect. The previous split into two effects caused
  // a race condition where listeners ran before rooms were joined.
  useEffect(() => {
    if (!socketReady || conversations.length === 0) return;

    let cancelled = false;

    log.message.debug('[useConversations] Setting up: joining rooms + attaching listeners');

    // ── Step 1: Join ALL conversation rooms (staggered) ──
    // Server broadcasts new_message to Socket.IO rooms (conversation:{id}).
    // Without joining, the sidebar never receives events.
    //
    // IMPORTANT: Room joins are staggered to avoid exhausting the server's
    // database connection pool. Each join_conversation triggers a DB query
    // on the server (membership check + mark-read). Joining all rooms
    // simultaneously floods the pool (QueuePool limit reached).
    const newRooms: string[] = [];
    for (const conv of conversations) {
      if (!joinedRoomsRef.current.has(conv.id)) {
        joinedRoomsRef.current.add(conv.id);
        newRooms.push(conv.id);
      }
    }

    if (newRooms.length > 0) {
      log.message.debug(
        `[useConversations] Staggering ${newRooms.length} room joins`
      );

      // Join rooms sequentially with a delay to avoid overwhelming the server
      const joinRoomsStaggered = async () => {
        for (const id of newRooms) {
          if (cancelled) break;
          socketClient.joinConversation(id);
          // 150ms between joins — fast enough for UX, gentle on the server pool
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      };

      joinRoomsStaggered();
    }

    // ── Step 2: Resolve current user for own-message detection ──
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

    // ── Step 3: Handle reconnection (staggered re-join + refresh) ──
    const handleConnect = () => {
      log.ws.info('[useConversations] Socket reconnected — re-joining all rooms');
      const roomIds = Array.from(joinedRoomsRef.current);
      const rejoinStaggered = async () => {
        for (const id of roomIds) {
          if (cancelled) break;
          socketClient.joinConversation(id);
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      };
      rejoinStaggered();
      // Refresh to catch messages missed during disconnection
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    };

    const socket = socketClient.getSocket();
    socket?.on('connect', handleConnect);

    // ── Step 4: Attach WebSocket listeners ──
    const listQueryKey = queryKeys.conversations.list({ limit, offset: 0, type });

    // Listen for new messages — direct cache update for instant sidebar rendering
    const handleNewMessage = (message: Record<string, unknown>) => {
      const conversationId = (message.conversation_id || message.conversationId) as string;
      const senderId = (message.sender_id || message.senderId) as string;

      if (!conversationId) return;

      const isOwnMessage = senderId === currentUserId;

      // INSTANT UPDATE: Directly update the conversation cache
      queryClient.setQueryData(
        listQueryKey,
        (oldData: unknown) => {
          if (!oldData) return oldData;
          return updateConversationCacheWithNewMessage(oldData, conversationId, message, isOwnMessage);
        }
      );

      // Update unread counts for messages from others
      if (!isOwnMessage) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }

      // Background sync: invalidate to eventually reconcile with server
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
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
      cancelled = true;
      log.message.debug('[useConversations] Cleaning up WebSocket listeners');
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_status', handleMessageStatus);
      socketClient.off('conversation_updated', handleConversationUpdated);
      socket?.off('connect', handleConnect);
    };
  }, [queryClient, socketReady, limit, type, conversations]);

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
