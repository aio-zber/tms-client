/**
 * useSendMessage Hook
 * Handles sending messages with optimistic updates
 */

import { useState, useCallback } from 'react';
import { messageService } from '../services/messageService';
import type { SendMessageRequest, Message } from '@/types/message';

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
        
        // Call optimistic add callback if provided
        // This allows the parent component to immediately add the message to UI
        if (message && onOptimisticAdd) {
          console.log('[useSendMessage] Calling optimistic add callback with message:', message);
          onOptimisticAdd(message);
        }
        
        return message;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to send message:', err);
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
