/**
 * useMessageActions Hook
 * Handles message editing, deletion, and reactions
 * Now with optimistic updates for instant sender feedback
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';
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
  const queryClient = useQueryClient();

  const editMessage = useCallback(
    async (messageId: string, data: EditMessageRequest) => {
      setLoading(true);
      setError(null);

      // Get all message query keys to update all conversations this message might appear in
      const allQueries = queryClient.getQueriesData({
        queryKey: queryKeys.messages.all
      });

      // Store previous data for rollback
      const previousData: Array<[unknown[], unknown]> = [];

      try {
        // OPTIMISTIC UPDATE: Update cache immediately before API call
        allQueries.forEach(([queryKey]) => {
          const oldData = queryClient.getQueryData(queryKey);

          if (oldData) {
            // Store for rollback
            previousData.push([queryKey as unknown[], oldData]);

            // Optimistically update the message in cache
            queryClient.setQueryData(queryKey, (old: unknown) => {
              if (!old || typeof old !== 'object') return old;

              const cachedData = old as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

              return {
                ...cachedData,
                pages: cachedData.pages.map((page) => ({
                  ...page,
                  data: page.data.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          content: data.content || msg.content,
                          isEdited: true,
                          updatedAt: new Date().toISOString()
                        }
                      : msg
                  ),
                })),
              };
            });
          }
        });

        console.log('[useMessageActions] ✅ Optimistically updated message in cache:', messageId);

        // Now make the actual API call in background
        const updatedMessage = await messageService.editMessage(messageId, data);

        console.log('[useMessageActions] ✅ API confirmed edit:', updatedMessage.id);
        return updatedMessage;
      } catch (err) {
        // ROLLBACK: Restore previous cache state on error
        console.error('[useMessageActions] ❌ Edit failed, rolling back cache:', err);

        previousData.forEach(([queryKey, oldData]) => {
          queryClient.setQueryData(queryKey, oldData);
        });

        setError(err as Error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [queryClient]
  );

  const deleteMessage = useCallback(async (messageId: string) => {
    setLoading(true);
    setError(null);

    // Get all message query keys to update all conversations
    const allQueries = queryClient.getQueriesData({
      queryKey: queryKeys.messages.all
    });

    // Store previous data for rollback
    const previousData: Array<[unknown[], unknown]> = [];

    try {
      // OPTIMISTIC UPDATE: Remove message from cache immediately
      allQueries.forEach(([queryKey]) => {
        const oldData = queryClient.getQueryData(queryKey);

        if (oldData) {
          // Store for rollback
          previousData.push([queryKey as unknown[], oldData]);

          // Optimistically remove the message from cache
          queryClient.setQueryData(queryKey, (old: unknown) => {
            if (!old || typeof old !== 'object') return old;

            const cachedData = old as { pages: Array<{ data: Message[] }>; pageParams: unknown[] };

            return {
              ...cachedData,
              pages: cachedData.pages.map((page) => ({
                ...page,
                data: page.data.filter((msg) => msg.id !== messageId),
              })),
            };
          });
        }
      });

      console.log('[useMessageActions] ✅ Optimistically removed message from cache:', messageId);

      // Now make the actual API call in background
      await messageService.deleteMessage(messageId);

      console.log('[useMessageActions] ✅ API confirmed deletion:', messageId);
      return true;
    } catch (err) {
      // ROLLBACK: Restore previous cache state on error
      console.error('[useMessageActions] ❌ Delete failed, rolling back cache:', err);

      previousData.forEach(([queryKey, oldData]) => {
        queryClient.setQueryData(queryKey, oldData);
      });

      setError(err as Error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

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
