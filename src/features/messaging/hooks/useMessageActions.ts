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
import { log } from '@/lib/logger';

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
      
      pendingEdits.add(messageId);
      

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

        

        // Now make the actual API call in background
        const updatedMessage = await messageService.editMessage(messageId, data);

        
        

        // Clear pending flag immediately - deduplication not needed (TanStack Query handles it)
        
        
        pendingEdits.delete(messageId);

        return updatedMessage;
      } catch (err) {
        // ROLLBACK: Restore previous cache state on error
        log.message.error('Edit failed, rolling back:', err);

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

      

      // Now make the actual API call in background
      await messageService.deleteMessage(messageId);

      

      // Clear pending flag immediately
      pendingDeletes.delete(messageId);

      return true;
    } catch (err) {
      // ROLLBACK: Restore previous cache state on error
      log.message.error('Delete failed, rolling back:', err);

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
      log.message.warn('No currentUserId, skipping optimistic update');
      try {
        await messageService.addReaction(messageId, { emoji });
        return true;
      } catch (err) {
        setError(err as Error);
        log.message.error('Failed to add reaction:', err);
        return false;
      }
    }

    // Mark as pending to prevent WebSocket handler from overwriting optimistic update
    
    pendingReactions.set(messageId, { emoji, action: 'add' });
    

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

      

      // Now make the actual API call in background
      await messageService.addReaction(messageId, { emoji });

      
      

      // Don't invalidate queries - let WebSocket events update the cache
      // The WebSocket handler will replace temp reactions with real server data
      // This prevents flashing by avoiding a refetch

      // Clear pending flag immediately
      
      
      pendingReactions.delete(messageId);

      return true;
    } catch (err) {
      // ROLLBACK: Restore previous cache state on error
      log.message.error('Add reaction failed:', err);

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
        log.message.warn('No currentUserId, skipping optimistic update');
        try {
          await messageService.removeReaction(messageId, emoji);
          return true;
        } catch (err) {
          setError(err as Error);
          log.message.error('Failed to remove reaction:', err);
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

        

        // Now make the actual API call in background
        await messageService.removeReaction(messageId, emoji);

        

        // Clear pending flag immediately
        pendingReactions.delete(messageId);

        return true;
      } catch (err) {
        // ROLLBACK: Restore previous cache state on error
        log.message.error('Remove reaction failed:', err);

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
        log.message.warn('No currentUserId, skipping optimistic update');
        try {
          // Sequentially remove old and add new
          await messageService.removeReaction(messageId, oldEmoji);
          await messageService.addReaction(messageId, { emoji: newEmoji });
          return true;
        } catch (err) {
          setError(err as Error);
          log.message.error('Failed to switch reaction:', err);
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
                          // DON'T remove old reaction here - let WebSocket reaction_removed handle it
                          // Just add the new temp reaction alongside
                          // The reaction_added WebSocket event will replace this temp reaction
                          reactions: [
                            ...(msg.reactions || []),
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

        // Backend now handles atomic switching - just call addReaction
        // If user has an existing reaction, backend will remove it first automatically
        await messageService.addReaction(messageId, { emoji: newEmoji });

        

        // Don't invalidate queries - let WebSocket events update the cache
        // The WebSocket handler will replace temp reactions with real server data
        // This prevents flashing by avoiding a refetch

        // Clear pending flag immediately
        pendingReactions.delete(messageId);

        return true;
      } catch (err) {
        // ROLLBACK: Restore previous cache state on error
        log.message.error('Switch reaction failed:', err);

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
