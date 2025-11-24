/**
 * useGlobalConversationEvents Hook
 *
 * Handles WebSocket events for ALL conversations globally.
 * Creates system messages for conversation events regardless of which conversation is being viewed.
 *
 * IMPORTANT: This is a temporary client-side workaround until the backend
 * implements server-side system message creation. The proper solution is for
 * the backend to create and broadcast system messages as MESSAGE events.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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

/**
 * Global hook to handle conversation events for all conversations.
 * Should be called once at the app level (e.g., in layout or main component).
 */
export function useGlobalConversationEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = socketClient.getSocket();

    if (!socket) {
      console.warn('[useGlobalConversationEvents] Socket not initialized');
      return;
    }

    console.log('[useGlobalConversationEvents] Registering global listeners');

    /**
     * Helper to add system message to conversation's cache
     */
    const addSystemMessageToCache = (conversationId: string, systemMessage: Message) => {
      const queryKey = ['messages', conversationId, { limit: 50 }];

      console.log('[useGlobalConversationEvents] Adding system message to cache:', {
        conversationId,
        messageType: systemMessage.metadata?.system?.eventType,
        content: systemMessage.content
      });

      queryClient.setQueryData(queryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') {
          console.log('[useGlobalConversationEvents] No cache for conversation:', conversationId);
          return old;
        }

        const cachedData = old as { pages: Array<{ data: Message[]; pagination?: unknown }>; pageParams: unknown[] };

        const lastPageIndex = cachedData.pages.length - 1;
        if (lastPageIndex < 0) {
          console.log('[useGlobalConversationEvents] No pages in cache for conversation:', conversationId);
          return old;
        }

        const updatedPages = [...cachedData.pages];
        updatedPages[lastPageIndex] = {
          ...updatedPages[lastPageIndex],
          data: [...updatedPages[lastPageIndex].data, systemMessage],
        };

        console.log('[useGlobalConversationEvents] ✅ System message added to cache');

        return {
          ...cachedData,
          pages: updatedPages,
        };
      });
    };

    /**
     * Handle member_added event (global)
     */
    const handleMemberAdded = (data: Record<string, unknown>) => {
      console.log('[useGlobalConversationEvents] member_added event:', data);

      const eventData = data as unknown as MemberAddedEvent;
      const conversationId = eventData.conversation_id;

      // Create system message
      const addedMemberIds = eventData.added_members.map(m => m.user_id);
      const addedMemberNames = eventData.added_members.map(m => m.full_name);
      const systemMessage = generateMemberAddedMessage(
        conversationId,
        eventData.added_by,
        'Someone',
        addedMemberIds,
        addedMemberNames
      );

      addSystemMessageToCache(conversationId, systemMessage);
    };

    /**
     * Handle member_removed event (global)
     */
    const handleMemberRemoved = (data: Record<string, unknown>) => {
      console.log('[useGlobalConversationEvents] member_removed event:', data);

      const eventData = data as unknown as MemberRemovedEvent;
      const conversationId = eventData.conversation_id;

      // Create system message
      const systemMessage = generateMemberRemovedMessage(
        conversationId,
        eventData.removed_by,
        'Someone',
        eventData.removed_user_id,
        'Member'
      );

      addSystemMessageToCache(conversationId, systemMessage);
    };

    /**
     * Handle member_left event (global)
     */
    const handleMemberLeft = (data: Record<string, unknown>) => {
      console.log('[useGlobalConversationEvents] member_left event:', data);

      const eventData = data as unknown as MemberLeftEvent;
      const conversationId = eventData.conversation_id;

      // Create system message
      const systemMessage = generateMemberLeftMessage(
        conversationId,
        eventData.user_id,
        eventData.user_name
      );

      addSystemMessageToCache(conversationId, systemMessage);
    };

    /**
     * Handle conversation_updated event (global)
     */
    const handleConversationUpdated = (data: Record<string, unknown>) => {
      console.log('[useGlobalConversationEvents] conversation_updated event:', data);

      const eventData = data as unknown as ConversationUpdatedEvent;
      const conversationId = eventData.conversation_id;

      // Create system message
      const systemMessage = generateConversationUpdatedMessage(
        conversationId,
        eventData.updated_by,
        'Someone',
        {
          name: eventData.name,
          avatarUrl: eventData.avatar_url,
        }
      );

      addSystemMessageToCache(conversationId, systemMessage);
    };

    // Register global WebSocket event listeners
    socketClient.onMemberAdded(handleMemberAdded);
    socketClient.onMemberRemoved(handleMemberRemoved);
    socketClient.onMemberLeft(handleMemberLeft);
    socketClient.onConversationUpdated(handleConversationUpdated);

    console.log('[useGlobalConversationEvents] ✅ All global listeners registered');

    // Cleanup
    return () => {
      console.log('[useGlobalConversationEvents] Cleaning up global listeners');
      socketClient.off('member_added', handleMemberAdded);
      socketClient.off('member_removed', handleMemberRemoved);
      socketClient.off('member_left', handleMemberLeft);
      socketClient.off('conversation_updated', handleConversationUpdated);
    };
  }, [queryClient]);
}
