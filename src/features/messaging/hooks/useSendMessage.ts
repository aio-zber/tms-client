/**
 * useSendMessage Hook
 * Handles sending messages with optimistic updates
 */

import { useState, useCallback } from 'react';
import { messageService } from '../services/messageService';
import type { SendMessageRequest, Message } from '@/types/message';

interface UseSendMessageReturn {
  sendMessage: (data: SendMessageRequest) => Promise<Message | null>;
  sending: boolean;
  error: Error | null;
}

export function useSendMessage(): UseSendMessageReturn {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(async (data: SendMessageRequest) => {
    setSending(true);
    setError(null);

    try {
      const message = await messageService.sendMessage(data);
      return message;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to send message:', err);
      return null;
    } finally {
      setSending(false);
    }
  }, []);

  return {
    sendMessage,
    sending,
    error,
  };
}
