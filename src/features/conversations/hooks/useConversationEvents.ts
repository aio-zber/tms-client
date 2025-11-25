/**
 * useConversationEvents Hook
 *
 * Handles real-time WebSocket events for conversation updates.
 * Following Telegram/Messenger patterns for instant member management updates.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { socketClient } from '@/lib/socket';
import type { ConversationUpdatedEvent } from '@/types/conversation';

interface UseConversationEventsOptions {
  conversationId: string;
  /**
   * Whether to show toast notifications for events.
   * Default: true
   */
  showNotifications?: boolean;
}

/**
 * Hook to handle real-time conversation events via WebSocket.
 *
 * Automatically registers listeners for:
 * - conversation_updated: Name/avatar changed
 *
 * NOTE: Member events (added/removed/left) are now handled as system messages
 * via message:new events, which the useMessages hook handles automatically.
 *
 * @example
 * ```tsx
 * function ChatPage({ conversationId }: { conversationId: string }) {
 *   useConversationEvents({ conversationId });
 *   // Real-time updates handled automatically
 *   return <ChatWindow />;
 * }
 * ```
 */
export function useConversationEvents({
  conversationId,
  showNotifications = true,
}: UseConversationEventsOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = socketClient.getSocket();

    if (!socket) {
      console.warn('[useConversationEvents] Socket not initialized');
      return;
    }

    console.log('[useConversationEvents] Registering listeners for conversation:', conversationId);

    /**
     * Handle conversation_updated event
     * Triggered when conversation name/avatar is updated
     *
     * NOTE: Backend now sends system messages for all conversation events via message:new.
     * We only need to invalidate queries here - system messages are handled by useMessages hook.
     */
    const handleConversationUpdated = (data: Record<string, unknown>) => {
      console.log('[useConversationEvents] conversation_updated event:', data);

      const eventData = data as unknown as ConversationUpdatedEvent;
      if (eventData.conversation_id !== conversationId) return;

      // Invalidate conversation query to refetch updated details
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });

      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      if (showNotifications) {
        if (eventData.name) {
          toast.success(`Conversation renamed to "${eventData.name}"`);
        } else {
          toast.success('Conversation updated');
        }
      }
    };

    // Register WebSocket event listeners
    // NOTE: member_added, member_removed, member_left events are no longer sent by backend.
    // Backend now sends system messages via message:new event (handled by useMessages hook).
    // We only listen to conversation_updated for immediate UI updates.
    socketClient.onConversationUpdated(handleConversationUpdated);

    console.log('[useConversationEvents] ✅ Conversation updated listener registered');

    // Cleanup: Unregister listeners on unmount
    return () => {
      console.log('[useConversationEvents] Cleaning up listeners for conversation:', conversationId);
      socketClient.off('conversation_updated', handleConversationUpdated);
    };
  }, [conversationId, queryClient, showNotifications]);
}
