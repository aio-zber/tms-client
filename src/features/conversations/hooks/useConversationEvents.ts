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
import type {
  MemberAddedEvent,
  MemberRemovedEvent,
  MemberLeftEvent,
  ConversationUpdatedEvent
} from '@/types/conversation';

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
 * - member_added: New member(s) added to conversation
 * - member_removed: Member removed by admin
 * - member_left: Member left voluntarily
 * - conversation_updated: Name/avatar changed
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
     * Handle member_added event
     * Triggered when admin adds new member(s) to the conversation
     */
    const handleMemberAdded = (data: MemberAddedEvent) => {
      console.log('[useConversationEvents] member_added event:', data);

      if (data.conversation_id !== conversationId) return;

      // Invalidate conversation query to refetch with new members
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });

      // Also invalidate conversations list to update member count
      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      if (showNotifications) {
        const memberNames = data.added_members.map(m => m.full_name).join(', ');
        toast.success(`${memberNames} added to conversation`);
      }
    };

    /**
     * Handle member_removed event
     * Triggered when admin removes a member from the conversation
     */
    const handleMemberRemoved = (data: MemberRemovedEvent) => {
      console.log('[useConversationEvents] member_removed event:', data);

      if (data.conversation_id !== conversationId) return;

      // Invalidate conversation query to refetch with updated members
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });

      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      if (showNotifications) {
        toast.info('Member removed from conversation');
      }
    };

    /**
     * Handle member_left event
     * Triggered when a member voluntarily leaves the conversation
     */
    const handleMemberLeft = (data: MemberLeftEvent) => {
      console.log('[useConversationEvents] member_left event:', data);

      if (data.conversation_id !== conversationId) return;

      // Invalidate conversation query
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });

      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      if (showNotifications) {
        toast.info(`${data.user_name} left the conversation`);
      }
    };

    /**
     * Handle conversation_updated event
     * Triggered when conversation name/avatar is updated
     */
    const handleConversationUpdated = (data: ConversationUpdatedEvent) => {
      console.log('[useConversationEvents] conversation_updated event:', data);

      if (data.conversation_id !== conversationId) return;

      // Invalidate conversation query to refetch updated details
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });

      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      if (showNotifications) {
        if (data.name) {
          toast.success(`Conversation renamed to "${data.name}"`);
        } else {
          toast.success('Conversation updated');
        }
      }
    };

    // Register WebSocket event listeners
    socketClient.onMemberAdded(handleMemberAdded);
    socketClient.onMemberRemoved(handleMemberRemoved);
    socketClient.onMemberLeft(handleMemberLeft);
    socketClient.onConversationUpdated(handleConversationUpdated);

    console.log('[useConversationEvents] ✅ All listeners registered');

    // Cleanup: Unregister listeners on unmount
    return () => {
      console.log('[useConversationEvents] Cleaning up listeners for conversation:', conversationId);

      socketClient.off('member_added', handleMemberAdded);
      socketClient.off('member_removed', handleMemberRemoved);
      socketClient.off('member_left', handleMemberLeft);
      socketClient.off('conversation_updated', handleConversationUpdated);
    };
  }, [conversationId, queryClient, showNotifications]);
}
