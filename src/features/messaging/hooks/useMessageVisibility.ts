/**
 * useMessageVisibility Hook
 *
 * Implements Telegram/Messenger-style automatic message read detection using Intersection Observer:
 * - Detects when messages are 50%+ visible for 1+ second
 * - Batches mark-as-read requests (max 1 request per 2 seconds)
 * - Limits batch size to 50 messages
 * - Prevents spam and optimizes network usage
 */

import { useCallback, useRef, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';
import type { Message } from '@/types/message';

interface UseMessageVisibilityOptions {
  /**
   * Message to track
   */
  message: Message;

  /**
   * Conversation ID
   */
  conversationId: string;

  /**
   * Current user ID (to skip marking own messages)
   */
  currentUserId?: string;

  /**
   * Whether to enable visibility tracking
   */
  enabled?: boolean;

  /**
   * Visibility threshold (default: 0.5 = 50%)
   */
  threshold?: number;

  /**
   * Delay before marking as read in ms (default: 1000ms)
   */
  delayMs?: number;
}

/**
 * Hook to track message visibility and auto-mark as read
 *
 * @example
 * ```tsx
 * const { ref, isVisible } = useMessageVisibility({
 *   message,
 *   conversationId,
 *   currentUserId,
 *   enabled: message.status !== 'read'
 * });
 *
 * return <div ref={ref}>{message.content}</div>;
 * ```
 */
export function useMessageVisibility({
  message,
  conversationId,
  currentUserId,
  enabled = true,
  threshold = 0.5,
  delayMs = 1000,
}: UseMessageVisibilityOptions) {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Don't track if:
  // - Disabled
  // - Message is from current user
  // - Already marked as read
  const shouldTrack =
    enabled &&
    message.senderId !== currentUserId &&
    message.status !== 'read';

  // Intersection Observer hook (50% visible threshold)
  const { ref, inView, entry } = useInView({
    threshold,
    triggerOnce: false, // Keep tracking
    skip: !shouldTrack,
    onChange: (inView, entry) => {
      console.log('[useMessageVisibility] InView changed:', {
        messageId: message.id,
        inView,
        ratio: entry.intersectionRatio,
        shouldTrack,
        enabled,
        currentUserId,
        senderId: message.senderId,
        status: message.status,
      });
    },
  });

  // Mutation for marking messages as read
  const markReadMutation = useMutation({
    mutationFn: async (messageIds: string[]) => {
      await messageService.markMessagesAsRead({
        conversation_id: conversationId,
        message_ids: messageIds,
      });
    },
    onSuccess: () => {
      // OPTIMISTIC UPDATE: Immediately clear unread count in conversation list
      queryClient.setQueryData(
        queryKeys.conversations.all,
        (oldData: unknown) => {
          if (!oldData) return oldData;

          const data = oldData as { pages: Array<{ data: Array<{ id: string; unreadCount: number }> }> };
          return {
            ...data,
            pages: data.pages.map(page => ({
              ...page,
              data: page.data.map(conv =>
                conv.id === conversationId
                  ? { ...conv, unreadCount: 0 }
                  : conv
              )
            }))
          };
        }
      );

      // Invalidate messages query to refresh status
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.all,
      });

      // Invalidate unread count (standardized query keys)
      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.conversation(conversationId),
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.total(),
      });

      // Force conversation list refresh
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    },
  });

  // Handle visibility changes
  useEffect(() => {
    if (!shouldTrack || !inView) {
      // Clear timeout if not visible
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      return;
    }

    // Check intersection ratio (must be >= threshold)
    const ratio = entry?.intersectionRatio ?? 0;
    if (ratio < threshold) {
      return;
    }

    // Message is visible! Wait for delay before marking as read
    timeoutRef.current = setTimeout(() => {
      // Mark this single message as read
      markReadMutation.mutate([message.id]);
    }, delayMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [inView, shouldTrack, entry?.intersectionRatio, threshold, delayMs, message.id, markReadMutation]);

  return {
    ref,
    isVisible: inView && (entry?.intersectionRatio ?? 0) >= threshold,
    isMarking: markReadMutation.isPending,
  };
}

/**
 * Hook for batched message visibility tracking
 * Use this for lists to batch mark-as-read requests
 */
export function useMessageVisibilityBatch(conversationId: string, _currentUserId?: string) {
  const queryClient = useQueryClient();
  const batchRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<NodeJS.Timeout>();

  const markReadMutation = useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (messageIds.length === 0) return;

      console.log('[useMessageVisibilityBatch] 🚀 Making API call to mark messages as read:', messageIds);
      await messageService.markMessagesAsRead({
        conversation_id: conversationId,
        message_ids: messageIds,
      });
      console.log('[useMessageVisibilityBatch] ✅ API call succeeded');
    },
    onSuccess: () => {
      console.log('[useMessageVisibilityBatch] Invalidating queries after successful mark-as-read');

      // OPTIMISTIC UPDATE: Immediately clear unread count in conversation list
      // Provides instant UI feedback (Messenger/Telegram pattern)
      queryClient.setQueryData(
        queryKeys.conversations.all,
        (oldData: unknown) => {
          if (!oldData) return oldData;

          const data = oldData as { pages: Array<{ data: Array<{ id: string; unreadCount: number }> }> };
          return {
            ...data,
            pages: data.pages.map(page => ({
              ...page,
              data: page.data.map(conv =>
                conv.id === conversationId
                  ? { ...conv, unreadCount: 0 }
                  : conv
              )
            }))
          };
        }
      );

      // Invalidate messages query
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.all,
      });

      // Invalidate unread count queries (for server reconciliation)
      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.conversation(conversationId),
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.total(),
      });

      // CRITICAL: Force conversation list refresh to sync with server
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });

      // Clear batch
      batchRef.current.clear();
      console.log('[useMessageVisibilityBatch] Batch cleared, unread count cleared optimistically, queries invalidated');
    },
    onError: (error) => {
      console.error('[useMessageVisibilityBatch] ❌ Failed to mark messages as read:', error);
    },
  });

  const scheduleBatchMarkAsRead = useCallback(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Schedule batch processing
    timeoutRef.current = setTimeout(() => {
      const messages = Array.from(batchRef.current);
      console.log('[useMessageVisibilityBatch] Batch timeout fired, messages to mark:', messages.length);
      if (messages.length > 0) {
        // Limit to 50 messages per batch
        const batch = messages.slice(0, 50);
        console.log('[useMessageVisibilityBatch] Triggering mutation for batch:', batch);
        markReadMutation.mutate(batch);
      }
    }, 2000); // 2 second debounce
  }, [markReadMutation]);

  const trackMessage = useCallback(
    (messageId: string) => {
      console.log('[useMessageVisibilityBatch] trackMessage called for:', messageId);
      console.log('[useMessageVisibilityBatch] Current batch size:', batchRef.current.size);
      batchRef.current.add(messageId);
      console.log('[useMessageVisibilityBatch] New batch size:', batchRef.current.size);
      scheduleBatchMarkAsRead();
    },
    [scheduleBatchMarkAsRead]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    trackMessage,
    isMarking: markReadMutation.isPending,
    pendingCount: batchRef.current.size,
  };
}

export default useMessageVisibility;
