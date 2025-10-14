/**
 * useMessageActions Hook
 * Handles message editing, deletion, and reactions
 */

import { useState, useCallback } from 'react';
import { messageService } from '../services/messageService';
import type { EditMessageRequest, Message } from '@/types/message';

interface UseMessageActionsReturn {
  editMessage: (messageId: string, data: EditMessageRequest) => Promise<Message | null>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  addReaction: (messageId: string, emoji: string) => Promise<boolean>;
  removeReaction: (messageId: string, emoji: string) => Promise<boolean>;
  loading: boolean;
  error: Error | null;
}

export function useMessageActions(): UseMessageActionsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const editMessage = useCallback(
    async (messageId: string, data: EditMessageRequest) => {
      setLoading(true);
      setError(null);

      try {
        const updatedMessage = await messageService.editMessage(messageId, data);
        return updatedMessage;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to edit message:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteMessage = useCallback(async (messageId: string) => {
    setLoading(true);
    setError(null);

    try {
      await messageService.deleteMessage(messageId);
      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to delete message:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    setError(null);

    try {
      await messageService.addReaction(messageId, { emoji });
      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to add reaction:', err);
      return false;
    }
  }, []);

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      setError(null);

      try {
        await messageService.removeReaction(messageId, emoji);
        return true;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to remove reaction:', err);
        return false;
      }
    },
    []
  );

  return {
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    loading,
    error,
  };
}
