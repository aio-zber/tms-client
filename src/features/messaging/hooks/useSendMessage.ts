/**
 * useSendMessage Hook
 * Handles sending messages with optimistic updates
 *
 * Messenger/Telegram pattern:
 * - Tracks recently sent message IDs to prevent duplicate cache updates
 * - When WebSocket receives our own message back, we skip cache invalidation
 * - This prevents the "flash" where optimistic message disappears and reappears
 */

import { log } from '@/lib/logger';
import { useState, useCallback } from 'react';
import { messageService } from '../services/messageService';
import type { SendMessageRequest, Message } from '@/types/message';

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

interface UseSendMessageReturn {
  sendMessage: (
    data: SendMessageRequest,
    onOptimisticAdd?: (message: Message) => void
  ) => Promise<Message | null>;
  sending: boolean;
  error: Error | null;
}

export function useSendMessage(): UseSendMessageReturn {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(
    async (
      data: SendMessageRequest,
      onOptimisticAdd?: (message: Message) => void
    ) => {
      setSending(true);
      setError(null);

      try {
        const message = await messageService.sendMessage(data);

        if (message) {
          // Track this message ID to prevent WebSocket handler from invalidating cache
          // This preserves the optimistic update when we receive our own message back
          trackSentMessage(message.id);

          // Call optimistic add callback if provided
          // This allows the parent component to immediately add the message to UI
          if (onOptimisticAdd) {
            log.message.debug('[useSendMessage] Calling optimistic add callback with message:', message);
            onOptimisticAdd(message);
          }
        }

        return message;
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

  return {
    sendMessage,
    sending,
    error,
  };
}
