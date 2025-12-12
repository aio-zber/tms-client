'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useConversationActions } from './useConversationActions';

/**
 * Hook to handle leaving a conversation with confirmation and navigation
 * Provides a consistent UX for the leave conversation flow
 *
 * Note: Toast notifications are now handled by useConversationActions hook
 *
 * @param conversationId - The ID of the conversation to leave
 * @returns A callback function that handles the complete leave flow
 */
export function useLeaveConversation(conversationId: string) {
  const router = useRouter();
  const { leaveConversation } = useConversationActions();

  return useCallback(() => {
    // Confirm before leaving
    if (!confirm('Are you sure you want to leave this conversation?')) {
      return;
    }

    // Leave conversation (toast notifications handled by hook)
    leaveConversation(conversationId);

    // Navigate back to chat list
    router.push('/chats');
  }, [conversationId, leaveConversation, router]);
}
