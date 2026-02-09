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
}

interface UseSendMessageReturn {
  sendMessage: (
    data: SendMessageRequest,
    onOptimisticAdd?: (message: Message) => void,
    options?: SendMessageOptions
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
   * Send a message with optional E2EE encryption
   */
  const sendMessage = useCallback(
    async (
      data: SendMessageRequest,
      onOptimisticAdd?: (message: Message) => void,
      options?: SendMessageOptions
    ) => {
      setSending(true);
      setError(null);

      try {
        let requestData = { ...data };
        // Viber/Signal pattern: preserve plaintext for sender's own display
        // The sender never decrypts their own messages — they keep the original
        const originalContent = data.content;
        let wasEncrypted = false;

        // If encryption is enabled, encrypt the message content
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
              encryptedContent = await encryptionService.encryptGroupMessageContent(
                data.conversation_id,
                options.currentUserId,
                data.content
              );
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
              metadata: {
                ...requestData.metadata,
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

        const rawMessage = await messageService.sendMessage(requestData);

        if (rawMessage) {
          // Transform API response from snake_case to camelCase
          const message = transformServerMessage(rawMessage as unknown as Record<string, unknown>);

          // Viber/Signal pattern: sender always sees their own plaintext
          // The API returns encrypted content, so we replace it with the original
          if (wasEncrypted) {
            message.content = originalContent;
            // Cache plaintext so API reloads also show it correctly
            cacheDecryptedContent(message.id, originalContent);
          }

          // Track this message ID to prevent WebSocket handler from invalidating cache
          trackSentMessage(message.id);

          // Call optimistic add callback if provided
          if (onOptimisticAdd) {
            log.message.debug('[useSendMessage] Calling optimistic add callback with message:', message);
            onOptimisticAdd(message);
          }

          return message;
        }

        return null;
      } catch (err) {
        setError(err as Error);
        log.message.error('Failed to send message:', err);
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
