/**
 * useMessages Hook
 * Manages message fetching and state for a conversation
 * Now uses TanStack Query for proper cache management and server state sync
 * Includes deduplication logic to prevent WebSocket race conditions
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { queryKeys } from '@/lib/queryClient';
import { useMessagesQuery } from './useMessagesQuery';
import { isPendingDelete } from './useMessageActions';
import { nowUTC } from '@/lib/dateUtils';
import type { Message } from '@/types/message';
import { log } from '@/lib/logger';

interface UseMessagesOptions {
  limit?: number;
  autoLoad?: boolean;
}

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  isFetchingNextPage: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMessages: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  addOptimisticMessage: (message: Message) => void;
}

export function useMessages(
  conversationId: string,
  options: UseMessagesOptions = {}
): UseMessagesReturn {
  const { limit = 50, autoLoad = true } = options;
  const queryClient = useQueryClient();

  // Track if we've already attempted to fix missing sequence numbers to prevent infinite loop
  const hasAttemptedFixRef = useRef<Record<string, boolean>>({});

  // Use TanStack Query infinite query
  const {
    messages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useMessagesQuery({
    conversationId,
    limit,
    enabled: autoLoad,
  });

  // CRITICAL FIX: Clear cache if messages don't have sequence numbers
  // This handles the migration from timestamp-only to sequence-based ordering
  // NOTE: Only runs once per conversation to prevent infinite loops
  useEffect(() => {
    if (!conversationId || !messages || messages.length === 0) return;

    // Prevent infinite loop: only attempt fix once per conversation
    if (hasAttemptedFixRef.current[conversationId]) return;

    // Check if any message is missing sequenceNumber
    const hasMissingSequence = messages.some(msg => msg.sequenceNumber === undefined || msg.sequenceNumber === null);

    if (hasMissingSequence) {
      log.message.warn('Detected messages without sequence numbers - clearing cache and refetching');

      // Mark that we've attempted the fix for this conversation
      hasAttemptedFixRef.current[conversationId] = true;

      // Clear the query cache for this conversation
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });

      // Force refetch to get messages with sequence numbers
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]); // Only depend on conversationId to prevent running on every message update

  // Add message optimistically (for sender's own messages)
  const addOptimisticMessage = useCallback((message: Message) => {
    log.message.debug('Adding optimistic message:', message.id);

    // Optimistically add to query cache
    queryClient.setQueryData(
      queryKeys.messages.list(conversationId, { limit }),
      (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') return oldData;

        const data = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

        // Add message to the last page (most recent messages)
        const newPages = [...data.pages];
        const lastPage = newPages[newPages.length - 1];

        if (lastPage) {
          lastPage.data = [...lastPage.data, message];
        }

        return {
          ...data,
          pages: newPages,
        };
      }
    );
  }, [queryClient, conversationId, limit]);

  // WebSocket: Real-time message updates with query invalidation
  useEffect(() => {
    if (!conversationId) return;

    const socket = socketClient.getSocket();
    if (!socket) {
      log.ws.warn('Socket not initialized');
      return;
    }

    let hasJoined = false;

    // Join the conversation room
    const joinRoom = () => {
      if (hasJoined) return;
      socketClient.joinConversation(conversationId);
      hasJoined = true;
    };

    // Try to join immediately if already connected
    if (socketClient.isConnected()) {
      joinRoom();
    }

    // Listen for connection events in case we're not connected yet
    const handleConnect = () => {
      if (!hasJoined) {
        joinRoom();
      }
    };

    socket.on('connect', handleConnect);

    // Listen for new messages - invalidate query to refetch
    const handleNewMessage = (message: Record<string, unknown>) => {
      log.message.debug('New message received:', message);

      const msg = message as Partial<Message>;

      // Invalidate messages query to refetch from server
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });

      // If this is a system message about member/conversation changes,
      // also invalidate conversation queries for real-time updates across all clients
      if (msg.type === 'SYSTEM' && msg.metadata?.system) {
        const eventType = msg.metadata.system.eventType;

        if (
          eventType === 'member_added' ||
          eventType === 'member_removed' ||
          eventType === 'member_left' ||
          eventType === 'conversation_updated'
        ) {
          log.message.debug('System message detected, invalidating conversation queries:', eventType);

          // Invalidate conversation detail query to refetch member list
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.detail(conversationId),
          });

          // Invalidate conversations list to update member counts
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.all,
          });
        }
      }
    };

    // Listen for message edits - optimistic cache update (regular function, not useCallback)
    const handleMessageEdited = (updatedMessage: Record<string, unknown>) => {
      const messageId = updatedMessage.message_id as string;
      const newContent = updatedMessage.content as string;
      const deletedAt = updatedMessage.deleted_at as string | undefined; // Handle deletions via message:edit

      log.message.debug(`Message edited:`, { messageId, deletedAt: !!deletedAt });

      // Update cache for other users who didn't initiate the edit
      queryClient.setQueryData(
        queryKeys.messages.list(conversationId, { limit }),
        (oldData: unknown) => {
          if (!oldData) return oldData;

          const data = oldData as { pages: Array<{ data: Message[] }> };
          return {
            ...data,
            pages: data.pages.map(page => ({
              ...page,
              data: page.data.map(msg =>
                msg.id === messageId
                  ? {
                      ...msg,
                      content: newContent,
                      isEdited: !deletedAt, // Don't mark as edited if deleted
                      deletedAt: deletedAt, // Set deletedAt timestamp if present
                      updatedAt: nowUTC()
                    }
                  : msg
              )
            }))
          };
        }
      );
    };

    // Listen for message deletions - update with deletedAt instead of removing (Messenger pattern)
    const handleMessageDeleted = (data: Record<string, unknown>) => {
      const messageId = data.message_id as string;

      // DEDUPLICATION: Skip if this is the sender's own delete (already optimistically updated)
      if (isPendingDelete(messageId)) {
        log.message.debug('Skipping duplicate delete (sender optimistic update):', messageId);
        return;
      }

      log.message.debug('Message deleted:', messageId);

      // UPDATE message with deletedAt timestamp (DON'T remove it from cache)
      // This allows MessageBubble to show "User removed a message" placeholder
      queryClient.setQueryData(
        queryKeys.messages.list(conversationId, { limit }),
        (oldData: unknown) => {
          if (!oldData) return oldData;

          const queryData = oldData as { pages: Array<{ data: Message[] }> };
          return {
            ...queryData,
            pages: queryData.pages.map(page => ({
              ...page,
              data: page.data.map(msg =>
                msg.id === messageId
                  ? { ...msg, deletedAt: nowUTC() }
                  : msg
              )
            }))
          };
        }
      );
    };

    // Listen for reactions added - optimistic cache update (Messenger pattern)
    const handleReactionAdded = (data: Record<string, unknown>) => {
      const { message_id, reaction: rawReaction } = data as {
        message_id: string;
        reaction: { id: string; userId?: string; user_id?: string; emoji: string; createdAt: string; created_at?: string };
      };

      // Normalize reaction object - handle both camelCase and snake_case from server
      const reaction = {
        id: rawReaction.id,
        userId: rawReaction.userId || rawReaction.user_id,
        emoji: rawReaction.emoji,
        createdAt: rawReaction.createdAt || rawReaction.created_at,
        messageId: message_id,
      };

      log.message.debug('Reaction added:', { messageId: message_id, emoji: reaction.emoji });

      // Add reaction to cache for other users who didn't initiate the reaction
      queryClient.setQueryData(
        queryKeys.messages.list(conversationId, { limit }),
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object') return oldData;

          const cachedData = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

          // Add reaction to the message in all pages
          const newPages = cachedData.pages.map((page) => ({
            ...page,
            data: page.data.map((msg) => {
              if (msg.id !== message_id) return msg;

              const currentReactions = msg.reactions || [];

              // FIRST: Check if this exact reaction (same emoji + userId) already exists (temp OR real)
              const existingReactionIndex = currentReactions.findIndex(
                (r) => r.userId === reaction.userId && r.emoji === reaction.emoji
              );

              // If the same emoji reaction exists (temp or real), REPLACE it with server reaction
              if (existingReactionIndex !== -1) {
                return {
                  ...msg,
                  reactions: currentReactions.map((r, idx) =>
                    idx === existingReactionIndex ? reaction : r
                  ) as Message['reactions'],
                };
              }

              // SECOND: No matching emoji found, so remove ALL temp reactions from this user and add server reaction
              const reactionsWithoutUserTemps = currentReactions.filter(
                (r) => !(r.userId === reaction.userId && r.id.startsWith('temp-'))
              );

              return {
                ...msg,
                reactions: [...reactionsWithoutUserTemps, reaction] as Message['reactions'],
              };
            }),
          }));

          return {
            ...cachedData,
            pages: newPages,
          };
        }
      );
    };

    // Listen for reactions removed - optimistic cache update (Messenger pattern)
    const handleReactionRemoved = (data: Record<string, unknown>) => {
      const { message_id, user_id, emoji } = data as {
        message_id: string;
        user_id: string;
        emoji: string;
      };

      log.message.debug('Reaction removed:', { messageId: message_id, emoji });

      // Remove reaction from cache
      queryClient.setQueryData(
        queryKeys.messages.list(conversationId, { limit }),
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object') return oldData;

          const cachedData = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

          // Remove reaction from the message in all pages
          // IMPORTANT: Only remove REAL reactions (not temp ones from optimistic updates)
          const newPages = cachedData.pages.map((page) => ({
            ...page,
            data: page.data.map((msg) =>
              msg.id === message_id
                ? {
                    ...msg,
                    reactions: (msg.reactions || []).filter(
                      (r) => !(r.userId === user_id && r.emoji === emoji && !r.id.startsWith('temp-'))
                    ),
                  }
                : msg
            ),
          }));

          return {
            ...cachedData,
            pages: newPages,
          };
        }
      );
    };

    // Listen for message status updates (Telegram/Messenger pattern)
    const handleMessageStatus = (data: Record<string, unknown>) => {
      const { message_id, status, conversation_id } = data as {
        message_id: string;
        status: string;
        conversation_id: string;
      };

      // Only handle status updates for this conversation
      if (conversation_id !== conversationId) {
        return;
      }

      log.message.debug('Message status update:', { messageId: message_id, status });

      // Optimistic update in cache
      queryClient.setQueryData(
        queryKeys.messages.list(conversationId, { limit }),
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object') return oldData;

          const data = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

          // Update message status in all pages
          const newPages = data.pages.map((page) => ({
            ...page,
            data: page.data.map((msg) =>
              msg.id === message_id ? { ...msg, status: status as Message['status'] } : msg
            ),
          }));

          return {
            ...data,
            pages: newPages,
          };
        }
      );

      // If status is READ, invalidate unread count
      if (status === 'read') {
        // Invalidate unread count queries (standardized query keys)
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }
    };

    // Listen for bulk messages delivered event
    const handleMessagesDelivered = (data: Record<string, unknown>) => {
      const { conversation_id } = data as {
        conversation_id: string;
      };

      // Only handle for this conversation
      if (conversation_id === conversationId) {
        log.message.debug('Messages marked as DELIVERED');
        // Refresh messages to update status
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.list(conversationId, { limit }),
        });
      }
    };

    // Listen for bulk messages read event (Messenger-style: when user opens conversation)
    const handleMessagesRead = (data: Record<string, unknown>) => {
      const { conversation_id } = data as {
        conversation_id: string;
      };

      // Only handle for this conversation
      if (conversation_id === conversationId) {
        log.message.debug('Messages marked as READ');
        // Refresh messages to update status
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.list(conversationId, { limit }),
        });
        // Also invalidate unread counts
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.conversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.unreadCount.total(),
        });
      }
    };

    // Listen for poll events
    const handleNewPoll = (data: Record<string, unknown>) => {
      log.message.debug('New poll created:', data);
      // Invalidate messages query to show new poll message
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });
    };

    const handlePollVote = (data: Record<string, unknown>) => {
      const pollData = data as { poll_id: string; user_id: string; poll: unknown };
      log.message.debug('Poll vote update:', { pollId: pollData.poll_id });

      // Optimistically update poll data in messages cache
      queryClient.setQueryData(
        queryKeys.messages.list(conversationId, { limit }),
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object') return oldData;

          const cachedData = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

          // Update poll data in all pages
          const newPages = cachedData.pages.map((page) => ({
            ...page,
            data: page.data.map((msg) =>
              msg.poll?.id === pollData.poll_id
                ? { ...msg, poll: pollData.poll as Message['poll'] }
                : msg
            ),
          }));

          return {
            ...cachedData,
            pages: newPages,
          };
        }
      );
    };

    const handlePollClosed = (data: Record<string, unknown>) => {
      const pollData = data as { poll_id: string; poll: unknown };
      log.message.debug('Poll closed:', { pollId: pollData.poll_id });

      // Optimistically update poll data in messages cache
      queryClient.setQueryData(
        queryKeys.messages.list(conversationId, { limit }),
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object') return oldData;

          const cachedData = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

          // Update poll data in all pages
          const newPages = cachedData.pages.map((page) => ({
            ...page,
            data: page.data.map((msg) =>
              msg.poll?.id === pollData.poll_id
                ? { ...msg, poll: pollData.poll as Message['poll'] }
                : msg
            ),
          }));

          return {
            ...cachedData,
            pages: newPages,
          };
        }
      );
    };

    socketClient.onNewMessage(handleNewMessage);
    socketClient.onMessageEdited(handleMessageEdited);
    socketClient.onMessageDeleted(handleMessageDeleted);
    socketClient.onReactionAdded(handleReactionAdded);
    socketClient.onReactionRemoved(handleReactionRemoved);
    socketClient.onMessageStatus(handleMessageStatus); // Real-time status updates

    // Listen for bulk delivered/read events
    socket.on('messages_delivered', handleMessagesDelivered);
    socket.on('messages_read', handleMessagesRead);

    // Listen for poll events
    socketClient.onNewPoll(handleNewPoll);
    socketClient.onPollVote(handlePollVote);
    socketClient.onPollClosed(handlePollClosed);

    // Cleanup
    return () => {
      socketClient.leaveConversation(conversationId);
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_edited', handleMessageEdited);
      socketClient.off('message_deleted', handleMessageDeleted);
      socketClient.off('reaction_added', handleReactionAdded);
      socketClient.off('reaction_removed', handleReactionRemoved);
      socketClient.off('message_status', handleMessageStatus); // Remove status listener
      socket.off('messages_delivered', handleMessagesDelivered); // Remove bulk delivered listener
      socket.off('messages_read', handleMessagesRead); // Remove bulk read listener
      socketClient.off('new_poll', handleNewPoll); // Remove poll event listeners
      socketClient.off('poll_vote_added', handlePollVote);
      socketClient.off('poll_closed', handlePollClosed);
      socket.off('connect', handleConnect);
    };
  }, [conversationId, queryClient, limit]);

  return {
    messages,
    loading: isLoading,
    isFetchingNextPage,
    error: error as Error | null,
    hasMore: hasNextPage ?? false,
    loadMessages: async () => { await refetch(); },
    loadMore: async () => { await fetchNextPage(); },
    refresh: async () => { await refetch(); },
    addOptimisticMessage,
  };
}
