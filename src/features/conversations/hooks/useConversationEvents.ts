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
import {
  generateMemberAddedMessage,
  generateMemberRemovedMessage,
  generateMemberLeftMessage,
  generateConversationUpdatedMessage,
} from '@/features/messaging/utils/systemMessages';
import type { Message } from '@/types/message';

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
    const handleMemberAdded = (data: Record<string, unknown>) => {
      console.log('[useConversationEvents] member_added event:', data);

      const eventData = data as unknown as MemberAddedEvent;
      console.log('[useConversationEvents] member_added - conversationId:', conversationId, 'event conversationId:', eventData.conversation_id);
      if (eventData.conversation_id !== conversationId) {
        console.log('[useConversationEvents] Skipping member_added - different conversation');
        return;
      }

      // Create system message for member added
      const addedMemberIds = eventData.added_members.map(m => m.user_id);
      const addedMemberNames = eventData.added_members.map(m => m.full_name);
      const systemMessage = generateMemberAddedMessage(
        conversationId,
        eventData.added_by,
        'Someone', // We don't have the actor name from the event
        addedMemberIds,
        addedMemberNames
      );

      // Add system message to infinite query cache
      const queryKey = ['messages', conversationId, { limit: 50 }];
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;

        const cachedData = old as { pages: Array<{ data: Message[]; pagination?: unknown }>; pageParams: unknown[] };

        // Add system message to the last page (most recent messages)
        const lastPageIndex = cachedData.pages.length - 1;
        if (lastPageIndex < 0) return old; // No pages yet

        const updatedPages = [...cachedData.pages];
        updatedPages[lastPageIndex] = {
          ...updatedPages[lastPageIndex],
          data: [...updatedPages[lastPageIndex].data, systemMessage],
        };

        return {
          ...cachedData,
          pages: updatedPages,
        };
      });

      // Invalidate conversation query to refetch with new members
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });

      // Also invalidate conversations list to update member count
      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      if (showNotifications) {
        const memberNames = eventData.added_members.map(m => m.full_name).join(', ');
        toast.success(`${memberNames} added to conversation`);
      }
    };

    /**
     * Handle member_removed event
     * Triggered when admin removes a member from the conversation
     */
    const handleMemberRemoved = (data: Record<string, unknown>) => {
      console.log('[useConversationEvents] member_removed event:', data);

      const eventData = data as unknown as MemberRemovedEvent;
      if (eventData.conversation_id !== conversationId) return;

      // Create system message for member removed
      const systemMessage = generateMemberRemovedMessage(
        conversationId,
        eventData.removed_by,
        'Someone', // We don't have the actor name from the event
        eventData.removed_user_id,
        'Member' // We don't have the removed user's name from the event
      );

      // Add system message to infinite query cache
      const queryKey = ['messages', conversationId, { limit: 50 }];
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;

        const cachedData = old as { pages: Array<{ data: Message[]; pagination?: unknown }>; pageParams: unknown[] };

        const lastPageIndex = cachedData.pages.length - 1;
        if (lastPageIndex < 0) return old;

        const updatedPages = [...cachedData.pages];
        updatedPages[lastPageIndex] = {
          ...updatedPages[lastPageIndex],
          data: [...updatedPages[lastPageIndex].data, systemMessage],
        };

        return {
          ...cachedData,
          pages: updatedPages,
        };
      });

      // Invalidate conversation query to refetch with updated members
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });

      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      if (showNotifications) {
        toast('Member removed from conversation');
      }
    };

    /**
     * Handle member_left event
     * Triggered when a member voluntarily leaves the conversation
     */
    const handleMemberLeft = (data: Record<string, unknown>) => {
      console.log('[useConversationEvents] member_left event:', data);

      const eventData = data as unknown as MemberLeftEvent;
      if (eventData.conversation_id !== conversationId) return;

      // Create system message for member left
      const systemMessage = generateMemberLeftMessage(
        conversationId,
        eventData.user_id,
        eventData.user_name
      );

      // Add system message to infinite query cache
      const queryKey = ['messages', conversationId, { limit: 50 }];
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;

        const cachedData = old as { pages: Array<{ data: Message[]; pagination?: unknown }>; pageParams: unknown[] };

        const lastPageIndex = cachedData.pages.length - 1;
        if (lastPageIndex < 0) return old;

        const updatedPages = [...cachedData.pages];
        updatedPages[lastPageIndex] = {
          ...updatedPages[lastPageIndex],
          data: [...updatedPages[lastPageIndex].data, systemMessage],
        };

        return {
          ...cachedData,
          pages: updatedPages,
        };
      });

      // Invalidate conversation query
      queryClient.invalidateQueries({
        queryKey: ['conversation', conversationId],
      });

      queryClient.invalidateQueries({
        queryKey: ['conversations'],
      });

      if (showNotifications) {
        toast(`${eventData.user_name} left the conversation`);
      }
    };

    /**
     * Handle conversation_updated event
     * Triggered when conversation name/avatar is updated
     */
    const handleConversationUpdated = (data: Record<string, unknown>) => {
      console.log('[useConversationEvents] conversation_updated event:', data);

      const eventData = data as unknown as ConversationUpdatedEvent;
      if (eventData.conversation_id !== conversationId) return;

      // Create system message for conversation updated
      const systemMessage = generateConversationUpdatedMessage(
        conversationId,
        eventData.updated_by,
        'Someone', // We don't have the actor name from the event
        {
          name: eventData.name,
          avatarUrl: eventData.avatar_url,
        }
      );

      // Add system message to infinite query cache
      const queryKey = ['messages', conversationId, { limit: 50 }];
      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;

        const cachedData = old as { pages: Array<{ data: Message[]; pagination?: unknown }>; pageParams: unknown[] };

        const lastPageIndex = cachedData.pages.length - 1;
        if (lastPageIndex < 0) return old;

        const updatedPages = [...cachedData.pages];
        updatedPages[lastPageIndex] = {
          ...updatedPages[lastPageIndex],
          data: [...updatedPages[lastPageIndex].data, systemMessage],
        };

        return {
          ...cachedData,
          pages: updatedPages,
        };
      });

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
