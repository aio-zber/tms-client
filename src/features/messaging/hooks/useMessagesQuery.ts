/**
 * useMessagesQuery Hook
 * TanStack Query version of message fetching with proper cache management
 * Supports infinite scrolling for loading older messages
 *
 * Viber/Signal E2EE pattern:
 * - Raw ciphertext NEVER reaches the UI — encrypted content is replaced immediately
 * - Decrypted content is cached; failed decryptions are cached as placeholders
 * - Sender's own messages use locally cached plaintext (Double Ratchet encrypts for recipient only)
 * - Failed decryptions expire after 5 minutes and are retried on refetch (important for late group keys)
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

/** Next.js dynamic imports throw a ChunkLoadError when the chunk hash has changed after deploy. */
function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'ChunkLoadError' || err.message.includes('Loading chunk');
}

/** How long a failed decryption is suppressed before being retried (ms). */
const FAILED_DECRYPTION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Track message IDs that failed decryption, per conversation, with a timestamp.
 * Outer key: conversationId. Inner key: messageId. Value: failedAt timestamp (ms).
 * Entries expire after FAILED_DECRYPTION_TTL_MS so late-arriving group keys can trigger a retry.
 */
export const failedDecryptionIds = new Map<string, Map<string, number>>();

/** Returns true when a message is within its suppression window (should not be retried yet). */
function isDecryptionSuppressed(conversationId: string, messageId: string): boolean {
  const inner = failedDecryptionIds.get(conversationId);
  if (!inner) return false;
  const failedAt = inner.get(messageId);
  if (failedAt === undefined) return false;
  if (Date.now() - failedAt >= FAILED_DECRYPTION_TTL_MS) {
    // Entry has expired — remove it and allow retry
    inner.delete(messageId);
    if (inner.size === 0) failedDecryptionIds.delete(conversationId);
    return false;
  }
  return true;
}

/** Mark a message as having failed decryption (starts the 5-minute suppression window). */
export function markDecryptionFailed(conversationId: string, messageId: string): void {
  let inner = failedDecryptionIds.get(conversationId);
  if (!inner) {
    inner = new Map<string, number>();
    failedDecryptionIds.set(conversationId, inner);
  }
  inner.set(messageId, Date.now());
}

/** Remove a single failed-decryption entry so the next refetch will retry. */
export function clearMessageFailedDecryption(conversationId: string, messageId: string): void {
  const inner = failedDecryptionIds.get(conversationId);
  if (!inner) return;
  inner.delete(messageId);
  if (inner.size === 0) failedDecryptionIds.delete(conversationId);
}

/** Remove all failed-decryption entries for a conversation (e.g. after a group key arrives). */
export function clearConversationFailedDecryptions(conversationId: string): void {
  failedDecryptionIds.delete(conversationId);
}

/** Clear all failed decryption state (call on logout). */
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
  const { conversationId, limit = 30, enabled = true } = options;
  const currentUserId = useUserStore((s) => s.currentUser?.id);

  const query = useInfiniteQuery({
    queryKey: queryKeys.messages.list(conversationId, { limit }),
    queryFn: async ({ pageParam }) => {
      let response;
      try {
        response = await messageService.getConversationMessages(conversationId, {
          limit,
          cursor: pageParam ? (pageParam as string) : undefined,
        });
      } catch (err) {
        if (isChunkLoadError(err)) {
          // Stale Next.js chunks after redeployment — reload to get fresh chunks
          window.location.reload();
          // Return empty page so TanStack Query doesn't mark this as a fatal error
          return { data: [] as Message[], pagination: { has_more: false, next_cursor: null } };
        }
        throw err;
      }

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
        // Deleted messages always show a placeholder — never decrypt their content.
        // This prevents ciphertext from flashing before the deletedAt check in MessageBubble.
        if (msg.deletedAt) {
          processedMessages.push(msg);
          continue;
        }

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

        // 3. Sender's own messages — try decrypting (Messenger Labyrinth pattern)
        //    DM: conversation key is symmetric → recovered from server key backup on new device
        //    Group: shared static group key — same decryptGroupMessageContent path, recoverable from backup
        //    Fall back to placeholder if decryption fails.
        if (currentUserId && msg.senderId === currentUserId) {
          if (msg.content.startsWith('{"v":')) {
            try {
              const { encryptionService } = await import('@/features/encryption');
              if (encryptionService.isInitialized()) {
                const isGroup = !!msg.senderKeyId;
                const decryptedContent = isGroup
                  ? await encryptionService.decryptGroupMessageContent(
                      msg.conversationId, msg.senderId, msg.content
                    )
                  : await encryptionService.decryptOwnDirectMessage(
                      msg.conversationId, msg.content
                    );
                cacheDecryptedContent(msg.id, decryptedContent, msg.conversationId);
                processedMessages.push({ ...msg, content: decryptedContent });
                continue;
              }
            } catch (ownMsgErr) {
              if (isChunkLoadError(ownMsgErr)) { window.location.reload(); }
              // Decryption failed (no group key yet / no backup) — show placeholder
            }
          }
          processedMessages.push({ ...msg, content: '[Encrypted message]' });
          continue;
        }

        // 4. Already failed recently — skip until the suppression window expires
        if (isDecryptionSuppressed(msg.conversationId, msg.id)) {
          processedMessages.push({ ...msg, content: '[Unable to decrypt message]' });
          continue;
        }

        // 5. Attempt decryption (DM or group) — sequential to preserve chain order for DMs
        try {
          const { encryptionService } = await import('@/features/encryption');
          if (!encryptionService.isInitialized()) {
            processedMessages.push({ ...msg, content: '[Unable to decrypt message]' });
            continue;
          }

          const isGroup = !!msg.senderKeyId;
          let decryptedContent: string;

          if (isGroup) {
            // Static group key — fully stateless, historical messages decryptable at any time
            decryptedContent = await encryptionService.decryptGroupMessageContent(
              msg.conversationId, msg.senderId, msg.content
            );
          } else {
            const msgMeta = msg.metadata as Record<string, unknown> | undefined;
            const encMeta = msgMeta?.encryption as Record<string, unknown> | undefined;

            const x3dhHeader = encMeta?.x3dhHeader
              ? encryptionService.deserializeX3DHHeader(encMeta.x3dhHeader as string)
              : undefined;
            decryptedContent = await encryptionService.decryptDirectMessage(
              msg.conversationId, msg.senderId, msg.content, x3dhHeader
            );
          }

          // 7. Cache successful decryption (in-memory + IndexedDB persistent)
          cacheDecryptedContent(msg.id, decryptedContent, msg.conversationId);
          processedMessages.push({ ...msg, content: decryptedContent });
        } catch (err) {
          // ChunkLoadError means the encryption module chunk hash changed after deploy — reload
          if (isChunkLoadError(err)) { window.location.reload(); }
          log.message.error(`[useMessagesQuery] Failed to decrypt message ${msg.id}:`, err);
          // 8. Mark as temporarily failed — will be retried after FAILED_DECRYPTION_TTL_MS
          markDecryptionFailed(msg.conversationId, msg.id);
          // Show friendly message for legacy v1 encryption vs genuine failures
          const isLegacy = err instanceof Error && 'code' in err && (err as { code: string }).code === 'LEGACY_VERSION';
          const fallback = isLegacy
            ? '[This message uses an older encryption version]'
            : '[Unable to decrypt message]';
          processedMessages.push({ ...msg, content: fallback });
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
    // 60s staleTime: cached messages render instantly on conversation revisit.
    // Real-time updates arrive via WebSocket (useMessages hook), so the cache
    // only needs to be refreshed from the server after 60s of staleness.
    // This is the key to instant conversation switching (Messenger pattern).
    staleTime: 60000,
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
