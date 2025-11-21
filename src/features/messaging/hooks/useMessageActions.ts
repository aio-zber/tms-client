/**
 * useMessageActions Hook
 * Handles message editing, deletion, and reactions
 * Now with optimistic updates for instant sender feedback
 * Includes pending operation tracking to prevent WebSocket race conditions
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';
import type { EditMessageRequest, Message } from '@/types/message';

// Module-level tracking of pending operations to prevent WebSocket race conditions
// These Sets track operations initiated by the current user to prevent duplicate cache updates
const pendingEdits = new Set<string>(); // messageId
const pendingDeletes = new Set<string>(); // messageId
const pendingReactions = new Map<string, { emoji: string; action: 'add' | 'remove' }>(); // messageId -> {emoji, action}

// Export helpers for use in useMessages.ts WebSocket handlers
export const isPendingEdit = (messageId: string): boolean => pendingEdits.has(messageId);
export const isPendingDelete = (messageId: string): boolean => pendingDeletes.has(messageId);
export const isPendingReaction = (messageId: string, emoji: string, action: 'add' | 'remove'): boolean => {
  const pending = pendingReactions.get(messageId);
  return pending?.emoji === emoji && pending?.action === action;
};

interface UseMessageActionsReturn {
  editMessage: (messageId: string, data: EditMessageRequest) => Promise<Message | null>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  addReaction: (messageId: string, emoji: string) => Promise<boolean>;
  removeReaction: (messageId: string, emoji: string) => Promise<boolean>;
  switchReaction: (messageId: string, oldEmoji: string, newEmoji: string) => Promise<boolean>;
  loading: boolean;
  error: Error | null;
}

interface UseMessageActionsOptions {
  currentUserId?: string;
}

export function useMessageActions(options: UseMessageActionsOptions = {}): UseMessageActionsReturn {
  const { currentUserId } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const queryClient = useQueryClient();

  const editMessage = useCallback(
    async (messageId: string, data: EditMessageRequest) => {
      setLoading(true);
      setError(null);

      // Mark as pending to prevent WebSocket handler from overwriting optimistic update
      const startTime = Date.now();
      pendingEdits.add(messageId);
      console.log(`[useMessageActions] ⏱️ [${startTime}] Edit started for message:`, messageId);

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

        const apiTime = Date.now();
        console.log(`[useMessageActions] ✅ [${apiTime}] API confirmed edit (${apiTime - startTime}ms):`, updatedMessage.id);

        // Clear pending flag immediately - deduplication not needed (TanStack Query handles it)
        const clearTime = Date.now();
        console.log(`[useMessageActions] 🔓 [${clearTime}] Clearing pending flag (${clearTime - startTime}ms total):`, messageId);
        pendingEdits.delete(messageId);

        return updatedMessage;
      } catch (err) {
        // ROLLBACK: Restore previous cache state on error
        console.error('[useMessageActions] ❌ Edit failed, rolling back cache:', err);

        previousData.forEach(([queryKey, oldData]) => {
          queryClient.setQueryData(queryKey, oldData);
        });

        // Clear pending flag on error
        pendingEdits.delete(messageId);

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

    // Mark as pending to prevent WebSocket handler from overwriting optimistic update
    pendingDeletes.add(messageId);

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

      // Clear pending flag immediately
      pendingDeletes.delete(messageId);

      return true;
    } catch (err) {
      // ROLLBACK: Restore previous cache state on error
      console.error('[useMessageActions] ❌ Delete failed, rolling back cache:', err);

      previousData.forEach(([queryKey, oldData]) => {
        queryClient.setQueryData(queryKey, oldData);
      });

      // Clear pending flag on error
      pendingDeletes.delete(messageId);

      setError(err as Error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    setError(null);

    if (!currentUserId) {
      console.warn('[useMessageActions] No currentUserId provided, skipping optimistic update');
      try {
        await messageService.addReaction(messageId, { emoji });
        return true;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to add reaction:', err);
        return false;
      }
    }

    // Mark as pending to prevent WebSocket handler from overwriting optimistic update
    const startTime = Date.now();
    pendingReactions.set(messageId, { emoji, action: 'add' });
    console.log(`[useMessageActions] ⏱️ [${startTime}] Add reaction started:`, messageId, emoji);

    // Get all message query keys to update all conversations
    const allQueries = queryClient.getQueriesData({
      queryKey: queryKeys.messages.all
    });

    // Store previous data for rollback
    const previousData: Array<[unknown[], unknown]> = [];

    // Create optimistic reaction object with deterministic ID
    // Use emoji + userId to prevent duplicate temps during rapid switching
    const optimisticReaction = {
      id: `temp-${currentUserId}-${emoji}`, // Deterministic temp ID
      userId: currentUserId,
      emoji,
      createdAt: new Date().toISOString()
    };

    try {
      // OPTIMISTIC UPDATE: Add reaction to cache immediately
      allQueries.forEach(([queryKey]) => {
        const oldData = queryClient.getQueryData(queryKey);

        if (oldData) {
          // Store for rollback
          previousData.push([queryKey as unknown[], oldData]);

          // Optimistically add the reaction to cache
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
                        // Remove any existing reactions by current user (backend handles this too)
                        // Then add the new reaction - ensures only one reaction per user
                        reactions: [
                          ...(msg.reactions || []).filter((r) => r.userId !== currentUserId),
                          optimisticReaction
                        ] as Message['reactions'],
                      }
                    : msg
                ),
              })),
            };
          });
        }
      });

      console.log('[useMessageActions] ✅ Optimistically added reaction to cache:', messageId, emoji);

      // Now make the actual API call in background
      await messageService.addReaction(messageId, { emoji });

      const apiTime = Date.now();
      console.log(`[useMessageActions] ✅ [${apiTime}] API confirmed reaction (${apiTime - startTime}ms):`, messageId, emoji);

      // Don't invalidate queries - let WebSocket events update the cache
      // The WebSocket handler will replace temp reactions with real server data
      // This prevents flashing by avoiding a refetch

      // Clear pending flag immediately
      const clearTime = Date.now();
      console.log(`[useMessageActions] 🔓 [${clearTime}] Clearing pending reaction flag (${clearTime - startTime}ms total):`, messageId, emoji);
      pendingReactions.delete(messageId);

      return true;
    } catch (err) {
      // ROLLBACK: Restore previous cache state on error
      console.error('[useMessageActions] ❌ Add reaction failed, rolling back cache:', err);

      previousData.forEach(([queryKey, oldData]) => {
        queryClient.setQueryData(queryKey, oldData);
      });

      // Clear pending flag on error
      pendingReactions.delete(messageId);

      setError(err as Error);
      return false;
    }
  }, [queryClient, currentUserId]);

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      setError(null);

      if (!currentUserId) {
        console.warn('[useMessageActions] No currentUserId provided, skipping optimistic update');
        try {
          await messageService.removeReaction(messageId, emoji);
          return true;
        } catch (err) {
          setError(err as Error);
          console.error('Failed to remove reaction:', err);
          return false;
        }
      }

      // Mark as pending to prevent WebSocket handler from overwriting optimistic update
      pendingReactions.set(messageId, { emoji, action: 'remove' });

      // Get all message query keys to update all conversations
      const allQueries = queryClient.getQueriesData({
        queryKey: queryKeys.messages.all
      });

      // Store previous data for rollback
      const previousData: Array<[unknown[], unknown]> = [];

      try {
        // OPTIMISTIC UPDATE: Remove reaction from cache immediately
        allQueries.forEach(([queryKey]) => {
          const oldData = queryClient.getQueryData(queryKey);

          if (oldData) {
            // Store for rollback
            previousData.push([queryKey as unknown[], oldData]);

            // Optimistically remove the reaction from cache
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
                          reactions: (msg.reactions || []).filter(
                            (r) => !(r.userId === currentUserId && r.emoji === emoji)
                          ),
                        }
                      : msg
                  ),
                })),
              };
            });
          }
        });

        console.log('[useMessageActions] ✅ Optimistically removed reaction from cache:', messageId, emoji);

        // Now make the actual API call in background
        await messageService.removeReaction(messageId, emoji);

        console.log('[useMessageActions] ✅ API confirmed reaction removal:', messageId, emoji);

        // Clear pending flag immediately
        pendingReactions.delete(messageId);

        return true;
      } catch (err) {
        // ROLLBACK: Restore previous cache state on error
        console.error('[useMessageActions] ❌ Remove reaction failed, rolling back cache:', err);

        previousData.forEach(([queryKey, oldData]) => {
          queryClient.setQueryData(queryKey, oldData);
        });

        // Clear pending flag on error
        pendingReactions.delete(messageId);

        setError(err as Error);
        return false;
      }
    },
    [queryClient, currentUserId]
  );

  const switchReaction = useCallback(
    async (messageId: string, oldEmoji: string, newEmoji: string) => {
      setError(null);

      if (!currentUserId) {
        console.warn('[useMessageActions] No currentUserId provided, skipping optimistic update');
        try {
          // Sequentially remove old and add new
          await messageService.removeReaction(messageId, oldEmoji);
          await messageService.addReaction(messageId, { emoji: newEmoji });
          return true;
        } catch (err) {
          setError(err as Error);
          console.error('Failed to switch reaction:', err);
          return false;
        }
      }

      // Mark as pending (switch operation)
      pendingReactions.set(messageId, { emoji: newEmoji, action: 'add' });

      // Get all message query keys to update all conversations
      const allQueries = queryClient.getQueriesData({
        queryKey: queryKeys.messages.all
      });

      // Store previous data for rollback
      const previousData: Array<[unknown[], unknown]> = [];

      // Create optimistic reaction object with deterministic ID
      // Use emoji + userId to prevent duplicate temps during rapid switching
      const optimisticReaction = {
        id: `temp-${currentUserId}-${newEmoji}`, // Deterministic temp ID
        userId: currentUserId,
        emoji: newEmoji,
        createdAt: new Date().toISOString()
      };

      try {
        // OPTIMISTIC UPDATE: Remove old emoji and add new emoji atomically
        allQueries.forEach(([queryKey]) => {
          const oldData = queryClient.getQueryData(queryKey);

          if (oldData) {
            // Store for rollback
            previousData.push([queryKey as unknown[], oldData]);

            // Optimistically switch the reaction in cache
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
                          // Remove ONLY the old emoji reaction, keep others
                          // This allows WebSocket events to properly reconcile
                          reactions: [
                            ...(msg.reactions || []).filter(
                              (r) => !(r.userId === currentUserId && r.emoji === oldEmoji)
                            ),
                            optimisticReaction
                          ] as Message['reactions'],
                        }
                      : msg
                  ),
                })),
              };
            });
          }
        });

        console.log('[useMessageActions] ✅ Optimistically switched reaction in cache:', messageId, oldEmoji, '->', newEmoji);
        console.log('[useMessageActions] 🔍 Added temp reaction with ID:', optimisticReaction.id);

        // Backend now handles atomic switching - just call addReaction
        // If user has an existing reaction, backend will remove it first automatically
        await messageService.addReaction(messageId, { emoji: newEmoji });

        console.log('[useMessageActions] ✅ API confirmed reaction switch:', messageId, newEmoji);

        // Don't invalidate queries - let WebSocket events update the cache
        // The WebSocket handler will replace temp reactions with real server data
        // This prevents flashing by avoiding a refetch

        // Clear pending flag immediately
        pendingReactions.delete(messageId);

        return true;
      } catch (err) {
        // ROLLBACK: Restore previous cache state on error
        console.error('[useMessageActions] ❌ Switch reaction failed, rolling back cache:', err);

        previousData.forEach(([queryKey, oldData]) => {
          queryClient.setQueryData(queryKey, oldData);
        });

        // Clear pending flag on error
        pendingReactions.delete(messageId);

        setError(err as Error);
        return false;
      }
    },
    [queryClient, currentUserId]
  );

  return {
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    switchReaction,
    loading,
    error,
  };
}
