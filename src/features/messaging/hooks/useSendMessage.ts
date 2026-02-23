/**
 * useSendMessage Hook
 * Handles sending messages with optimistic updates and E2EE encryption
 *
 * Messenger/Telegram pattern:
 * - Tracks recently sent message IDs to prevent duplicate cache updates
 * - When WebSocket receives our own message back, we skip cache invalidation
 * - This prevents the "flash" where optimistic message disappears and reappears
 *
 * E2EE Support:
 * - Encrypts message content before sending when E2EE is enabled
 * - Supports both DM (Double Ratchet) and group (Sender Keys) encryption
 */

import { log } from '@/lib/logger';
import { useState, useCallback } from 'react';
import { messageService } from '../services/messageService';
import { transformServerMessage, cacheDecryptedContent } from './useMessages';
import type { SendMessageRequest, Message } from '@/types/message';
import type { EncryptionMetadata } from '@/types/message';
import { ENCRYPTION_VERSION } from '@/features/encryption/constants';
import { nowUTC } from '@/lib/dateUtils';

// Module-level tracking of recently sent messages to prevent WebSocket race conditions
// When we send a message, we add its ID here. When WebSocket notifies us of our own message,
// we check this set and skip cache invalidation to preserve the optimistic update.
const recentlySentMessages = new Set<string>();

// Time to keep message IDs in the set (5 seconds should be plenty)
const SENT_MESSAGE_EXPIRY_MS = 5000;

/**
 * Check if a message was recently sent by the current user
 * Used by useMessages to skip cache invalidation for our own messages
 */
export function isRecentlySentMessage(messageId: string): boolean {
  return recentlySentMessages.has(messageId);
}

/**
 * Mark a message as recently sent
 * Automatically expires after SENT_MESSAGE_EXPIRY_MS
 */
function trackSentMessage(messageId: string): void {
  recentlySentMessages.add(messageId);
  log.message.debug('[useSendMessage] Tracking sent message:', messageId);

  // Auto-expire after timeout
  setTimeout(() => {
    recentlySentMessages.delete(messageId);
    log.message.debug('[useSendMessage] Expired sent message tracking:', messageId);
  }, SENT_MESSAGE_EXPIRY_MS);
}

interface SendMessageOptions {
  /** Enable E2EE for this message */
  encrypted?: boolean;
  /** Recipient user ID (for DM encryption) */
  recipientId?: string;
  /** Is this a group conversation */
  isGroup?: boolean;
  /** Current user ID (for group encryption) */
  currentUserId?: string;
  /** Group member IDs (excluding self) — needed for sender key distribution */
  memberIds?: string[];
}

interface UseSendMessageReturn {
  sendMessage: (
    data: SendMessageRequest,
    onOptimisticAdd?: (message: Message) => void,
    options?: SendMessageOptions,
    onReplaceOptimistic?: (tempId: string, realMessage: Message) => void
  ) => Promise<Message | null>;
  sendEncryptedMessage: (
    data: SendMessageRequest,
    recipientId: string,
    isGroup: boolean,
    currentUserId: string,
    onOptimisticAdd?: (message: Message) => void
  ) => Promise<Message | null>;
  sending: boolean;
  error: Error | null;
}

export function useSendMessage(): UseSendMessageReturn {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Send a message with optional E2EE encryption.
   *
   * Messenger pattern — true optimistic updates:
   * 1. Add a temp message to the UI INSTANTLY (before any async work)
   * 2. Encrypt + send in the background
   * 3. Replace the temp message with the real server message
   *
   * This makes message sending feel instantaneous to the user.
   */
  const sendMessage = useCallback(
    async (
      data: SendMessageRequest,
      onOptimisticAdd?: (message: Message) => void,
      options?: SendMessageOptions,
      onReplaceOptimistic?: (tempId: string, realMessage: Message) => void
    ) => {
      setSending(true);
      setError(null);

      // Generate a temp ID for the optimistic message
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // STEP 1: Add temp message to UI instantly (Messenger pattern)
      // This happens BEFORE encryption and network — so the user sees their message immediately.
      if (onOptimisticAdd) {
        const tempMessage: Message = {
          id: tempId,
          conversationId: data.conversation_id,
          senderId: options?.currentUserId ?? '',
          content: data.content,
          type: data.type ?? 'TEXT',
          status: 'sending',
          replyToId: data.reply_to_id,
          isEdited: false,
          sequenceNumber: Date.now(), // large enough to sort to bottom
          createdAt: nowUTC(),
          encrypted: false, // always show plaintext optimistically
        };
        log.message.debug('[useSendMessage] Adding temp optimistic message:', tempId);
        onOptimisticAdd(tempMessage);
      }

      try {
        let requestData = { ...data };
        // Viber/Signal pattern: preserve plaintext for sender's own display
        // The sender never decrypts their own messages — they keep the original
        const originalContent = data.content;
        let wasEncrypted = false;

        // STEP 2: Encrypt in background (UI already shows the message)
        if (options?.encrypted && options.recipientId) {
          try {
            const { encryptionService } = await import('@/features/encryption');

            // Initialize encryption if not already done
            if (!encryptionService.isInitialized()) {
              await encryptionService.initialize();
            }

            let encryptedContent: string;
            const encryptionMetadata: EncryptionMetadata = {};

            if (options.isGroup && options.currentUserId) {
              // Group encryption using Sender Keys
              const result = await encryptionService.encryptGroupMessageContent(
                data.conversation_id,
                options.currentUserId,
                data.content
              );
              encryptedContent = result.encryptedContent;
              // sender_key_id is required for recipients to identify which sender key to use
              requestData = { ...requestData, sender_key_id: result.senderKeyId };
              encryptionMetadata.isGroup = true;

              // Messenger Sender Key pattern: distribute key to members before sending.
              // - New key (first message or post-rotation): AWAIT distribution so the
              //   key arrives at recipients before the message does. No race condition.
              // - Existing key (already distributed): fire-and-forget re-distribution
              //   (handles members who may have missed the initial distribution).
              if (options.memberIds && options.memberIds.length > 0) {
                const distributePromise = encryptionService.distributeSenderKey(
                  data.conversation_id,
                  options.currentUserId,
                  options.memberIds
                ).catch((err: unknown) => {
                  log.message.warn('[useSendMessage] Sender key distribution failed (non-critical):', err);
                });

                if (result.isNewKey) {
                  // Block send until key is distributed — prevents race where message
                  // arrives before recipients have the key to decrypt it.
                  await distributePromise;
                }
                // For existing keys: distribution is fire-and-forget (already distributed)
              }
            } else {
              // DM encryption using Double Ratchet
              const result = await encryptionService.encryptDirectMessage(
                data.conversation_id,
                options.recipientId,
                data.content
              );
              encryptedContent = result.encryptedContent;

              // Include X3DH header for first message
              if (result.header) {
                encryptionMetadata.x3dhHeader = encryptionService.serializeX3DHHeader(result.header);
              }
            }

            // Update request with encrypted content
            requestData = {
              ...requestData,
              content: encryptedContent,
              encrypted: true,
              encryption_version: ENCRYPTION_VERSION,
              metadata_json: {
                ...requestData.metadata_json,
                encryption: encryptionMetadata,
              },
            };

            wasEncrypted = true;
            log.message.debug('[useSendMessage] Message encrypted successfully');
          } catch (encryptError) {
            log.message.error('[useSendMessage] Encryption failed:', encryptError);
            // Fall back to unencrypted if encryption fails
          }
        }

        // STEP 3: Send to server
        const rawMessage = await messageService.sendMessage(requestData);

        if (rawMessage) {
          // Transform API response from snake_case to camelCase
          const message = transformServerMessage(rawMessage as unknown as Record<string, unknown>);

          // Viber/Signal pattern: sender always sees their own plaintext
          // The API returns encrypted content, so we replace it with the original
          if (wasEncrypted) {
            message.content = originalContent;
            // Cache plaintext so API reloads also show it correctly (in-memory + IndexedDB)
            // This also unblocks useConversations sidebar update (no more 200ms race)
            cacheDecryptedContent(message.id, originalContent, data.conversation_id);
          }

          // Track this message ID to prevent WebSocket handler from invalidating cache
          trackSentMessage(message.id);

          // STEP 4: Replace the temp message with the real server message
          if (onReplaceOptimistic) {
            log.message.debug('[useSendMessage] Replacing temp message:', tempId, '→', message.id);
            onReplaceOptimistic(tempId, message);
          } else if (onOptimisticAdd) {
            // Fallback: add the real message (addOptimisticMessage deduplicates by ID)
            onOptimisticAdd(message);
          }

          return message;
        }

        return null;
      } catch (err) {
        setError(err as Error);
        log.message.error('Failed to send message:', err);
        // On failure, remove the temp message by replacing it with nothing
        // We can't easily "remove" it with the current API, but the WS won't echo it back,
        // so it will be cleaned up on next cache invalidation / refetch.
        return null;
      } finally {
        setSending(false);
      }
    },
    []
  );

  /**
   * Convenience method for sending encrypted messages
   */
  const sendEncryptedMessage = useCallback(
    async (
      data: SendMessageRequest,
      recipientId: string,
      isGroup: boolean,
      currentUserId: string,
      onOptimisticAdd?: (message: Message) => void
    ) => {
      return sendMessage(data, onOptimisticAdd, {
        encrypted: true,
        recipientId,
        isGroup,
        currentUserId,
      });
    },
    [sendMessage]
  );

  return {
    sendMessage,
    sendEncryptedMessage,
    sending,
    error,
  };
}
