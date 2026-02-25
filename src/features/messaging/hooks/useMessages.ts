/**
 * useMessages Hook
 * Manages message fetching and state for a conversation
 * Now uses TanStack Query for proper cache management and server state sync
 * Includes deduplication logic to prevent WebSocket race conditions
 *
 * Messenger/Telegram pattern:
 * - Waits for socket connection before attaching listeners
 * - Re-attaches listeners on reconnection
 * - Auto-joins conversation room when socket connects
 *
 * E2EE Support:
 * - Decrypts messages on receive when encrypted flag is set
 * - Caches decrypted content to avoid re-decryption
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/lib/socket';
import { queryKeys } from '@/lib/queryClient';
import { useMessagesQuery, failedDecryptionIds } from './useMessagesQuery';
import { isPendingDelete } from './useMessageActions';
import { isRecentlySentMessage } from './useSendMessage';
import { nowUTC } from '@/lib/dateUtils';
import { useUserStore } from '@/store/userStore';
import { markMessagesAsDelivered } from '../services/messageService';
import { conversationService } from '@/features/conversations/services/conversationService';
import type { Message, MessageReaction } from '@/types/message';
import { log } from '@/lib/logger';

// Bounded LRU cache for decrypted message content (prevents re-decryption)
// Viber/Messenger pattern: keep recent messages in memory, evict oldest when full
const DECRYPTION_CACHE_MAX_SIZE = 1000;
export const decryptedContentCache = new Map<string, string>();

/**
 * Add to LRU cache with size limit and persist to IndexedDB
 * Evicts oldest entries when cache exceeds max size
 * IndexedDB persistence is fire-and-forget (non-blocking)
 */
export function cacheDecryptedContent(messageId: string, content: string, conversationId?: string): void {
  // If key exists, delete and re-add to move to end (most recent)
  if (decryptedContentCache.has(messageId)) {
    decryptedContentCache.delete(messageId);
  }

  // Evict oldest entries if cache is full
  while (decryptedContentCache.size >= DECRYPTION_CACHE_MAX_SIZE) {
    const oldestKey = decryptedContentCache.keys().next().value;
    if (oldestKey) {
      decryptedContentCache.delete(oldestKey);
    }
  }

  decryptedContentCache.set(messageId, content);

  // Persist to IndexedDB (fire-and-forget) for decrypt-once-store-forever pattern
  if (conversationId) {
    import('@/features/encryption/db/cryptoDb').then(({ storeDecryptedMessage }) => {
      storeDecryptedMessage(messageId, conversationId, content).catch(() => {
        // IndexedDB write failure is non-critical — in-memory cache still works
      });
    }).catch(() => {});
  }
}

/**
 * Decrypt message content if encrypted
 * Uses cache to avoid re-decryption
 */
async function decryptMessageContent(
  message: Message,
  isGroup: boolean
): Promise<string> {
  // Return cached decryption if available
  if (decryptedContentCache.has(message.id)) {
    return decryptedContentCache.get(message.id)!;
  }

  // If not encrypted, return original content
  if (!message.encrypted) {
    return message.content;
  }

  // Skip already-failed messages (shared with useMessagesQuery)
  if (failedDecryptionIds.has(message.id)) {
    return '[Unable to decrypt message]';
  }

  try {
    const { encryptionService } = await import('@/features/encryption');

    // Initialize if needed
    if (!encryptionService.isInitialized()) {
      await encryptionService.initialize();
    }

    let decryptedContent: string;
    const encryptionMetadata = message.metadata?.encryption;
    // senderKeyId is the reliable group indicator — non-null only for group E2EE messages
    const isGroupMessage = !!message.senderKeyId || isGroup;

    if (isGroupMessage) {
      decryptedContent = await encryptionService.decryptGroupMessageContent(
        message.conversationId,
        message.senderId,
        message.content
      );
    } else {
      // Parse X3DH header if present (for first message)
      const x3dhHeader = encryptionMetadata?.x3dhHeader
        ? encryptionService.deserializeX3DHHeader(encryptionMetadata.x3dhHeader)
        : undefined;

      decryptedContent = await encryptionService.decryptDirectMessage(
        message.conversationId,
        message.senderId,
        message.content,
        x3dhHeader
      );
    }

    // Cache decrypted content (LRU bounded + IndexedDB persistent)
    cacheDecryptedContent(message.id, decryptedContent, message.conversationId);

    return decryptedContent;
  } catch (error) {
    log.message.error(`[useMessages] Failed to decrypt message ${message.id}:`, error);
    const isLegacy = error instanceof Error && 'code' in error && (error as { code: string }).code === 'LEGACY_VERSION';
    const isGroupKeyMissing = error instanceof Error && 'code' in error && (error as { code: string }).code === 'SESSION_NOT_FOUND' && isGroup;

    if (isGroupKeyMissing) {
      // Don't permanently blacklist — the Chat.tsx useEffect will fetch the sender key
      // and then clear failedDecryptionIds + invalidate the cache for a retry.
      // Returning a placeholder here; useMessagesQuery will re-decrypt on cache invalidation.
      return '[Unable to decrypt message]';
    }

    // For DM failures and non-recoverable errors: track as permanently failed
    failedDecryptionIds.add(message.id);
    return isLegacy
      ? '[This message uses an older encryption version]'
      : '[Unable to decrypt message]';
  }
}

/**
 * Clear decryption cache (call on logout)
 */
export function clearDecryptionCache(): void {
  decryptedContentCache.clear();
  // Also clear failed decryption tracking so a new session can retry
  import('./useMessagesQuery').then(({ clearFailedDecryptions }) => {
    clearFailedDecryptions();
  }).catch(() => {});
  // Clear persistent IndexedDB cache
  import('@/features/encryption/db/cryptoDb').then(({ clearDecryptedMessages }) => {
    clearDecryptedMessages().catch(() => {});
  }).catch(() => {});
}

/**
 * Transform server message (snake_case) to client format (camelCase)
 * Server sends: { id, conversation_id, sender_id, created_at, ... }
 * Client expects: { id, conversationId, senderId, createdAt, ... }
 *
 * This handles BOTH WebSocket messages AND API responses to ensure consistency.
 * We check both snake_case and camelCase versions of each field for robustness.
 */
export function transformServerMessage(wsMessage: Record<string, unknown>): Message {
  // Transform reactions if present
  const rawReactions = wsMessage.reactions as Array<Record<string, unknown>> | undefined;
  const reactions: MessageReaction[] | undefined = rawReactions?.map(r => ({
    id: r.id as string,
    messageId: (r.message_id || r.messageId) as string,
    userId: (r.user_id || r.userId) as string,
    emoji: r.emoji as string,
    createdAt: (r.created_at || r.createdAt) as string,
  }));

  // Transform nested reply_to object if present (server includes full object in broadcast)
  const rawReplyTo = (wsMessage.reply_to || wsMessage.replyTo) as Record<string, unknown> | undefined;
  const replyTo: Message | undefined = rawReplyTo
    ? transformServerMessage(rawReplyTo)
    : undefined;

  return {
    id: wsMessage.id as string,
    conversationId: (wsMessage.conversation_id || wsMessage.conversationId) as string,
    senderId: (wsMessage.sender_id || wsMessage.senderId) as string,
    content: wsMessage.content as string,
    type: wsMessage.type as Message['type'],
    status: (wsMessage.status || 'sent') as Message['status'],
    metadata: (wsMessage.metadata_json || wsMessage.metadata) as Message['metadata'],
    replyToId: (wsMessage.reply_to_id || wsMessage.replyToId) as string | undefined,
    replyTo,
    reactions,
    isEdited: (wsMessage.is_edited || wsMessage.isEdited || false) as boolean,
    sequenceNumber: (wsMessage.sequence_number || wsMessage.sequenceNumber || 0) as number,
    createdAt: (wsMessage.created_at || wsMessage.createdAt) as string,
    updatedAt: (wsMessage.updated_at || wsMessage.updatedAt) as string | undefined,
    deletedAt: (wsMessage.deleted_at || wsMessage.deletedAt) as string | undefined,
    // E2EE fields
    encrypted: (wsMessage.encrypted as boolean) || false,
    encryptionVersion: (wsMessage.encryption_version || wsMessage.encryptionVersion) as number | undefined,
    senderKeyId: (wsMessage.sender_key_id || wsMessage.senderKeyId) as string | undefined,
  };
}

/**
 * Transform and optionally decrypt a message
 * For encrypted messages, attempts decryption asynchronously
 */
export async function transformAndDecryptMessage(
  wsMessage: Record<string, unknown>,
  isGroup: boolean = false
): Promise<Message> {
  const message = transformServerMessage(wsMessage);

  // If encrypted, attempt decryption
  if (message.encrypted) {
    try {
      const decryptedContent = await decryptMessageContent(message, isGroup);
      return { ...message, content: decryptedContent };
    } catch (error) {
      log.message.error(`[useMessages] Decryption failed for message ${message.id}:`, error);
      // Return message with placeholder content
      return { ...message, content: '[Encrypted message - unable to decrypt]' };
    }
  }

  return message;
}

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
  replaceOptimisticMessage: (tempId: string, realMessage: Message) => void;
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
    log.message.info('[addOptimisticMessage] Adding message:', message.id, 'type:', message.type);

    // Optimistically add to query cache
    queryClient.setQueryData(
      queryKeys.messages.list(conversationId, { limit }),
      (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') {
          log.message.warn('[addOptimisticMessage] No existing cache data');
          return oldData;
        }

        const data = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

        if (!data.pages || data.pages.length === 0) {
          log.message.warn('[addOptimisticMessage] No pages in cache');
          return oldData;
        }

        // Check if message already exists (prevent duplicates)
        const messageExists = data.pages.some(page =>
          page.data.some(m => m.id === message.id)
        );

        if (messageExists) {
          log.message.debug('[addOptimisticMessage] Message already exists, skipping:', message.id);
          return oldData;
        }

        // CRITICAL: Create NEW objects for immutability - React needs new references to detect changes
        // Map ALL pages to new objects, with the last page containing the new message
        const newPages = data.pages.map((page, index) => {
          if (index === data.pages.length - 1) {
            // Last page - add the new message
            return {
              ...page,
              data: [...page.data, message],
            };
          }
          // Other pages - return as-is (no need to copy since we're not modifying them)
          return page;
        });

        log.message.info('[addOptimisticMessage] ✅ Added message to cache:', message.id);

        return {
          ...data,
          pages: newPages,
        };
      }
    );
  }, [queryClient, conversationId, limit]);

  // Replace a temp optimistic message with the real server message (Messenger pattern)
  const replaceOptimisticMessage = useCallback((tempId: string, realMessage: Message) => {
    log.message.info('[replaceOptimisticMessage] Replacing temp message:', tempId, '→', realMessage.id);
    queryClient.setQueryData(
      queryKeys.messages.list(conversationId, { limit }),
      (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') return oldData;
        const data = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };
        if (!data.pages || data.pages.length === 0) return oldData;

        // Check if real message is already in cache (WebSocket may have added it)
        const realExists = data.pages.some(page => page.data.some(m => m.id === realMessage.id));

        const newPages = data.pages.map((page) => ({
          ...page,
          data: page.data.flatMap((m) => {
            if (m.id === tempId) return realExists ? [] : [realMessage];
            return [m];
          }),
        }));
        return { ...data, pages: newPages };
      }
    );
  }, [queryClient, conversationId, limit]);

  // Get current user ID for delivery marking
  const currentUserId = useUserStore((state) => state.currentUser?.id);

  // WebSocket: Real-time message updates with query invalidation
  // Attaches listeners immediately like useConversations does
  // The socketClient methods handle connection state internally
  useEffect(() => {
    if (!conversationId) return;

    log.ws.info('[useMessages] Setting up WebSocket listeners for conversation:', conversationId);

    // Join the conversation room (socketClient handles connection state)
    socketClient.joinConversation(conversationId);

    // Handle reconnection - re-join room and refresh data
    const handleConnect = () => {
      log.ws.info('[useMessages] Socket connected/reconnected - rejoining conversation:', conversationId);
      socketClient.joinConversation(conversationId);

      // Refresh messages to catch any missed during disconnection
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId, { limit }),
      });
    };

    // Get socket for direct event listening
    const socket = socketClient.getSocket();
    socket?.on('connect', handleConnect);

    // Listen for new messages - add to cache or invalidate
    const handleNewMessage = (wsMessage: Record<string, unknown>) => {
      log.message.debug('New message received via WebSocket:', wsMessage);

      // Get conversation ID from message (handle both snake_case and camelCase)
      const msgConversationId = (wsMessage.conversation_id || wsMessage.conversationId) as string;

      // IMPORTANT: Only process messages for THIS conversation
      // The WebSocket broadcasts to all clients, but we only update the current conversation's cache
      if (msgConversationId !== conversationId) {
        log.message.debug('[useMessages] Skipping message for different conversation:', msgConversationId);
        return;
      }

      // Get message ID (handle both snake_case and camelCase)
      const messageId = (wsMessage.id || wsMessage.message_id) as string;

      // DEDUPLICATION: Skip if this is our own recently sent message
      // The optimistic update already added it to the cache
      if (messageId && isRecentlySentMessage(messageId)) {
        log.message.debug('[useMessages] Skipping - recently sent message:', messageId);
        return;
      }

      // Transform WebSocket message from snake_case to camelCase
      // This is critical - server sends snake_case, but cache expects camelCase
      const transformedMessage = transformServerMessage(wsMessage);

      // Validate we have required fields after transformation
      if (!transformedMessage.id || !transformedMessage.createdAt) {
        log.message.warn('[useMessages] Invalid message data after transform, invalidating cache');
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.list(conversationId, { limit }),
        });
        return;
      }

      // Check if we have existing cache data before attempting to update
      const existingData = queryClient.getQueryData(queryKeys.messages.list(conversationId, { limit }));

      if (!existingData) {
        // No cache data exists - invalidate to trigger a fetch
        log.message.debug('[useMessages] No cache data exists, invalidating to fetch');
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.list(conversationId, { limit }),
        });
        return;
      }

      // Helper to add a message to the query cache
      const addMessageToCache = (msg: Message) => {
        queryClient.setQueryData(
          queryKeys.messages.list(conversationId, { limit }),
          (oldData: unknown) => {
            if (!oldData || typeof oldData !== 'object') {
              log.message.warn('[useMessages] Unexpected: oldData is empty in setQueryData');
              return oldData;
            }

            const data = oldData as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

            if (!data.pages || data.pages.length === 0) {
              log.message.warn('[useMessages] No pages in cache data');
              return oldData;
            }

            const messageExists = data.pages.some(page =>
              page.data.some(m => m.id === msg.id)
            );

            if (messageExists) {
              log.message.debug('[useMessages] Message already in cache, skipping:', msg.id);
              return oldData;
            }

            const newPages = data.pages.map((page, index) => {
              if (index === data.pages.length - 1) {
                return {
                  ...page,
                  data: [...page.data, msg],
                };
              }
              return page;
            });

            log.message.info('[useMessages] ✅ Added new message to cache:', msg.id, 'type:', msg.type);

            return {
              ...data,
              pages: newPages,
            };
          }
        );
      };

      // After decryption, patch the conversation list cache so the sidebar
      // shows the decrypted preview instead of the encrypted placeholder.
      const patchConversationLastMessage = (decryptedContent: string) => {
        queryClient.setQueriesData<{ pages: Array<{ data: Array<{ id: string; lastMessage?: { content: string; encrypted?: boolean } }> }>; pageParams: unknown[] }>(
          { queryKey: queryKeys.conversations.lists() },
          (oldData) => {
            if (!oldData?.pages) return oldData;
            const newPages = oldData.pages.map((page) => ({
              ...page,
              data: page.data.map((conv) => {
                if ((conv as { id: string }).id !== conversationId) return conv;
                if (!conv.lastMessage?.encrypted) return conv;
                return {
                  ...conv,
                  lastMessage: {
                    ...conv.lastMessage,
                    content: decryptedContent,
                    encrypted: false,
                  },
                };
              }),
            }));
            return { ...oldData, pages: newPages };
          }
        );
      };

      // If encrypted, decrypt asynchronously then add to cache
      if (transformedMessage.encrypted) {
        // Viber/Signal pattern: sender's own messages use cached plaintext
        const cached = decryptedContentCache.get(transformedMessage.id);
        if (cached) {
          addMessageToCache({ ...transformedMessage, content: cached });
          patchConversationLastMessage(cached);
        } else if (currentUserId && transformedMessage.senderId === currentUserId) {
          // Own encrypted message not in cache yet — the send path will add it
          // via optimistic update. Don't add a placeholder that would flash.
          log.message.debug('[useMessages] Skipping own encrypted message (waiting for send path):', transformedMessage.id);
        } else {
          // Recipient: decrypt the message
          // Use senderKeyId as the reliable group indicator — it's non-null only for group E2EE.
          // metadata_json.encryption.isGroup and conversation_type are unreliable (not always present).
          const isGroup = !!(wsMessage.sender_key_id || wsMessage.senderKeyId);

          transformAndDecryptMessage(wsMessage, isGroup).then((decryptedMsg) => {
            addMessageToCache(decryptedMsg);
            patchConversationLastMessage(decryptedMsg.content);
          }).catch(() => {
            addMessageToCache({ ...transformedMessage, content: '[Unable to decrypt message]' });
          });
        }
      } else {
        addMessageToCache(transformedMessage);
      }

      // Messenger pattern: auto-mark messages as read/delivered when received via WebSocket
      // Since useMessages is only mounted when the user has the conversation open,
      // any incoming message is immediately visible — mark as read (not just delivered).
      if (currentUserId && transformedMessage.senderId !== currentUserId) {
        // Mark as read (user is actively viewing this conversation)
        conversationService.markConversationAsRead(conversationId).catch((err) => {
          log.message.warn('Failed to mark conversation as read:', err);
          // Fallback: at least mark as delivered
          markMessagesAsDelivered({
            conversation_id: conversationId,
            message_ids: [transformedMessage.id],
          }).catch(() => {});
        });
      }

      // If this is a system message about member/conversation changes,
      // also invalidate conversation queries for real-time updates across all clients
      if (transformedMessage.type === 'SYSTEM' && transformedMessage.metadata?.system) {
        const eventType = transformedMessage.metadata.system.eventType;

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

          // E2EE: Rotate group key when group membership changes
          if (eventType === 'member_added' || eventType === 'member_removed' || eventType === 'member_left') {
            import('@/features/encryption').then(async ({ encryptionService, groupCryptoService }) => {
              if (!encryptionService.isInitialized()) return;
              if (!currentUserId) return;
              try {
                // Rotate to a new random key (old key stays for backward compat read, but new messages use new key)
                await groupCryptoService.rotateGroupKey(conversationId);
                // Invalidate the session distribution cache so the rotated key actually gets distributed.
                encryptionService.invalidateGroupKeyDistribution(conversationId);
                setTimeout(async () => {
                  try {
                    const { getConversationById } = await import('@/features/conversations/services/conversationService');
                    const conv = await getConversationById(conversationId);
                    if (conv?.type === 'group') {
                      const memberIds = conv.members.map((m: { userId: string }) => m.userId).filter((id: string) => id !== currentUserId);
                      await encryptionService.distributeSenderKey(conversationId, currentUserId, memberIds);
                    }
                  } catch (err) { log.message.error('[useMessages] Group key distribution failed:', err); }
                }, 1000);
              } catch (err) { log.message.error('[useMessages] Group key rotation failed:', err); }
            }).catch(() => {});
          }
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

      // Evict from decryption cache — deleted messages show a placeholder,
      // never their content. This prevents ciphertext from flashing.
      decryptedContentCache.delete(messageId);

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
    socketClient.onMessageStatus(handleMessageStatus);

    // Listen for bulk delivered/read events (use optional chaining for safety)
    socket?.on('messages_delivered', handleMessagesDelivered);
    socket?.on('messages_read', handleMessagesRead);

    // Listen for poll events
    socketClient.onNewPoll(handleNewPoll);
    socketClient.onPollVote(handlePollVote);
    socketClient.onPollClosed(handlePollClosed);

    // Listen for E2EE sender key distribution events
    const handleSenderKeyDistribution = (data: Record<string, unknown>) => {
      log.message.debug('[useMessages] Received sender key distribution:', data);
      import('@/features/encryption').then(({ encryptionService }) => {
        encryptionService.receiveSenderKeyDistribution(data as {
          conversation_id: string;
          sender_id: string;
          key_id: string;
          chain_key: string;
          public_signing_key: string;
        }).catch((err: unknown) => {
          log.message.error('[useMessages] Failed to process sender key distribution:', err);
        });
      }).catch(() => { /* E2EE not available */ });
    };
    socketClient.onSenderKeyDistribution(handleSenderKeyDistribution);

    // Cleanup
    return () => {
      log.ws.info('[useMessages] Cleaning up socket listeners for conversation:', conversationId);
      socketClient.leaveConversation(conversationId);
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('message_edited', handleMessageEdited);
      socketClient.off('message_deleted', handleMessageDeleted);
      socketClient.off('reaction_added', handleReactionAdded);
      socketClient.off('reaction_removed', handleReactionRemoved);
      socketClient.off('message_status', handleMessageStatus);
      socket?.off('messages_delivered', handleMessagesDelivered);
      socket?.off('messages_read', handleMessagesRead);
      socketClient.off('new_poll', handleNewPoll);
      socketClient.off('poll_vote_added', handlePollVote);
      socketClient.off('poll_closed', handlePollClosed);
      socketClient.off('sender_key_distribution', handleSenderKeyDistribution);
      socket?.off('connect', handleConnect);
    };
  }, [conversationId, queryClient, limit, currentUserId]);

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
    replaceOptimisticMessage,
  };
}
