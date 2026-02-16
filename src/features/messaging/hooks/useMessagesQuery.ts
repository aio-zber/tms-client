/**
 * useMessagesQuery Hook
 * TanStack Query version of message fetching with proper cache management
 * Supports infinite scrolling for loading older messages
 *
 * Viber/Signal E2EE pattern:
 * - Raw ciphertext NEVER reaches the UI — encrypted content is replaced immediately
 * - Decrypted content is cached; failed decryptions are cached as placeholders
 * - Sender's own messages use locally cached plaintext (Double Ratchet encrypts for recipient only)
 * - Decryption is attempted once per message; failures are not retried on refetch
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';
import { parseTimestamp } from '@/lib/dateUtils';
import { useUserStore } from '@/store/userStore';
import { decryptedContentCache, cacheDecryptedContent } from './useMessages';
import type { Message } from '@/types/message';
import { log } from '@/lib/logger';

// Track message IDs that permanently failed decryption so we never retry
// Exported so useMessages (WS path) can also check/update this set
export const failedDecryptionIds = new Set<string>();

/** Clear failed decryption cache (call on logout) */
export function clearFailedDecryptions(): void {
  failedDecryptionIds.clear();
}

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

      // Process messages: replace encrypted content BEFORE returning to UI
      // This ensures raw ciphertext never flashes in the UI
      // CRITICAL: Decrypt sequentially (not Promise.all) — Double Ratchet chain keys
      // are sequential state machines. Parallel decryption corrupts chain state.

      // Batch-load persistent cache from IndexedDB for all encrypted messages
      // This avoids N+1 async lookups in the per-message loop
      const encryptedMsgIds = response.data
        .filter((msg) => msg.encrypted && !decryptedContentCache.has(msg.id))
        .map((msg) => msg.id);

      let persistedCache = new Map<string, string>();
      if (encryptedMsgIds.length > 0) {
        try {
          const { getDecryptedMessages } = await import('@/features/encryption/db/cryptoDb');
          persistedCache = await getDecryptedMessages(encryptedMsgIds);
        } catch {
          // IndexedDB unavailable — fall through to decryption
        }
      }

      const processedMessages: typeof response.data = [];
      for (const msg of response.data) {
        if (!msg.encrypted) {
          processedMessages.push(msg);
          continue;
        }

        // 1. Check in-memory cache first (fast path, no async)
        const cached = decryptedContentCache.get(msg.id);
        if (cached) {
          processedMessages.push({ ...msg, content: cached });
          continue;
        }

        // 2. Check IndexedDB persistent cache (survives page refresh)
        const persisted = persistedCache.get(msg.id);
        if (persisted) {
          // Promote to in-memory cache for subsequent reads
          cacheDecryptedContent(msg.id, persisted, msg.conversationId);
          processedMessages.push({ ...msg, content: persisted });
          continue;
        }

        // 3. Sender's own messages — use placeholder
        //    Plaintext is cached at send time; if not in any cache, it was sent before E2EE persistence
        if (currentUserId && msg.senderId === currentUserId) {
          processedMessages.push({ ...msg, content: '[Encrypted message]' });
          continue;
        }

        // 4. Already failed — don't retry
        if (failedDecryptionIds.has(msg.id)) {
          processedMessages.push({ ...msg, content: '[Unable to decrypt message]' });
          continue;
        }

        // 5. Attempt Double Ratchet decryption (recipient path) — sequential to preserve chain order
        try {
          const { encryptionService } = await import('@/features/encryption');
          if (!encryptionService.isInitialized()) {
            processedMessages.push({ ...msg, content: '[Unable to decrypt message]' });
            continue;
          }

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

          // 6. Cache successful decryption (in-memory + IndexedDB persistent)
          cacheDecryptedContent(msg.id, decryptedContent, msg.conversationId);
          processedMessages.push({ ...msg, content: decryptedContent });
        } catch (err) {
          log.message.error(`[useMessagesQuery] Failed to decrypt message ${msg.id}:`, err);
          // 7. Mark as permanently failed — never retry this message
          failedDecryptionIds.add(msg.id);
          processedMessages.push({ ...msg, content: '[Unable to decrypt message]' });
        }
      }

      // Sort messages by sequence number (primary) and timestamp (fallback)
      const sortedMessages = processedMessages.sort((a, b) => {
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
