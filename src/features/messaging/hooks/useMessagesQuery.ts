/**
 * useMessagesQuery Hook
 * TanStack Query version of message fetching with proper cache management
 * Supports infinite scrolling for loading older messages
 *
 * Viber/Signal pattern for E2EE:
 * - Sender's own messages are never re-decrypted (plaintext cached at send time)
 * - Only recipient messages are decrypted via Double Ratchet / Sender Keys
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';
import { parseTimestamp } from '@/lib/dateUtils';
import { useUserStore } from '@/store/userStore';
import { decryptedContentCache } from './useMessages';
import type { Message } from '@/types/message';
import { log } from '@/lib/logger';

interface UseMessagesQueryOptions {
  conversationId: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook to fetch messages using infinite query for pagination
 * Messages are returned in ASC order (oldest first) for chat display
 */
export function useMessagesQuery(options: UseMessagesQueryOptions) {
  const { conversationId, limit = 50, enabled = true } = options;
  const currentUserId = useUserStore((s) => s.currentUser?.id);

  const query = useInfiniteQuery({
    queryKey: queryKeys.messages.list(conversationId, { limit }),
    queryFn: async ({ pageParam }) => {
      const response = await messageService.getConversationMessages(conversationId, {
        limit,
        cursor: pageParam ? (pageParam as string) : undefined,
      });

      // Decrypt any encrypted messages
      const decryptedMessages = await Promise.all(
        response.data.map(async (msg) => {
          if (!msg.encrypted) return msg;

          // Viber/Signal pattern: sender's own messages use cached plaintext
          // The sender can't decrypt their own Double Ratchet messages (encrypted for recipient)
          const cached = decryptedContentCache.get(msg.id);
          if (cached) {
            return { ...msg, content: cached };
          }

          // Skip decryption for own messages that aren't cached
          // (e.g., sent before this session — they can't be decrypted by the sender)
          if (currentUserId && msg.senderId === currentUserId) {
            return { ...msg, content: '[Message sent encrypted]' };
          }

          try {
            const { encryptionService } = await import('@/features/encryption');
            if (!encryptionService.isInitialized()) return msg;

            const msgMeta = msg.metadata as Record<string, unknown> | undefined;
            const encMeta = msgMeta?.encryption as Record<string, unknown> | undefined;
            const isGroup = !!encMeta?.isGroup;
            let decryptedContent: string;

            if (isGroup) {
              decryptedContent = await encryptionService.decryptGroupMessageContent(
                msg.conversationId, msg.senderId, msg.content
              );
            } else {
              const x3dhHeader = encMeta?.x3dhHeader
                ? encryptionService.deserializeX3DHHeader(encMeta.x3dhHeader as string)
                : undefined;
              decryptedContent = await encryptionService.decryptDirectMessage(
                msg.conversationId, msg.senderId, msg.content, x3dhHeader
              );
            }

            return { ...msg, content: decryptedContent };
          } catch (err) {
            log.message.error(`[useMessagesQuery] Failed to decrypt message ${msg.id}:`, err);
            return { ...msg, content: '[Unable to decrypt message]' };
          }
        })
      );

      // Sort messages by sequence number (primary) and timestamp (fallback)
      const sortedMessages = decryptedMessages.sort((a, b) => {
        if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
          if (a.sequenceNumber !== b.sequenceNumber) {
            return a.sequenceNumber - b.sequenceNumber;
          }
        }

        try {
          const dateA = parseTimestamp(a.createdAt).getTime();
          const dateB = parseTimestamp(b.createdAt).getTime();
          return dateA - dateB;
        } catch (error) {
          console.error('[useMessagesQuery] Failed to sort messages:', error);
          return 0;
        }
      });

      return {
        data: sortedMessages,
        pagination: response.pagination,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination?.has_more && lastPage.pagination?.next_cursor) {
        return lastPage.pagination.next_cursor as string;
      }
      return undefined;
    },
    initialPageParam: undefined as string | undefined,
    enabled: enabled && !!conversationId,
    refetchOnWindowFocus: true,
    staleTime: 10000,
  });

  // Flatten pages into a single array and ensure proper ordering
  // CRITICAL: Memoize to prevent creating new array on every render (causes infinite loops!)
  const messages: Message[] = useMemo(() => {
    if (!query.data?.pages) return [];

    const allMessages = query.data.pages.flatMap((page) => page.data);

    return allMessages.sort((a, b) => {
      if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
        if (a.sequenceNumber !== b.sequenceNumber) {
          return a.sequenceNumber - b.sequenceNumber;
        }
      }

      try {
        const dateA = parseTimestamp(a.createdAt).getTime();
        const dateB = parseTimestamp(b.createdAt).getTime();
        return dateA - dateB;
      } catch (error) {
        console.error('[useMessagesQuery] Failed to sort flattened messages:', error);
        return 0;
      }
    });
  }, [query.data?.pages]);

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  };
}
