'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConversationActions } from './useConversationActions';

/**
 * Hook to handle leaving a conversation with confirmation and navigation
 * Provides a consistent UX for the leave conversation flow
 *
 * @param conversationId - The ID of the conversation to leave
 * @returns A callback function that handles the complete leave flow
 */
export function useLeaveConversation(conversationId: string) {
  const router = useRouter();
  const { leaveConversation } = useConversationActions();

  return useCallback(async () => {
    // Confirm before leaving
    if (!confirm('Are you sure you want to leave this conversation?')) {
      return;
    }

    // Attempt to leave
    const success = await leaveConversation(conversationId);

    if (success) {
      toast.success('Left conversation');
      // Navigate back to chat list
      router.push('/chats');
    } else {
      toast.error('Failed to leave conversation');
    }
  }, [conversationId, leaveConversation, router]);
}
