/**
 * useMessagesAroundMessage Hook
 * Fetches messages around a specific message for search result context
 * Similar to how Messenger/Telegram load context when jumping to a message
 */

import { useQuery } from '@tanstack/react-query';
import { messageService } from '../services/messageService';
import { queryKeys } from '@/lib/queryClient';

interface UseMessagesAroundMessageOptions {
  messageId: string;
  conversationId: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook to fetch messages around a specific message
 * This is useful for search results - when user clicks a search result,
 * we need to load the surrounding context (messages before and after)
 *
 * @param options Configuration options
 * @returns Query result with messages around the target message
 */
export function useMessagesAroundMessage(options: UseMessagesAroundMessageOptions) {
  const { messageId, conversationId, limit = 20, enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.messages.around(messageId, conversationId),
    queryFn: async () => {
      // First, get the specific message
      const targetMessage = await messageService.getMessageById(messageId);

      // Then fetch messages in the conversation
      // We'll get messages and find the index of our target message
      const response = await messageService.getConversationMessages(conversationId, {
        limit: limit * 2, // Get more to ensure we have context before and after
      });

      // Find the target message in the list
      const targetIndex = response.data.findIndex((msg) => msg.id === messageId);

      if (targetIndex === -1) {
        // If not found in current page, return just the target message
        return {
          messages: [targetMessage],
          targetIndex: 0,
          targetMessage,
        };
      }

      // Return messages with the target message in the middle
      const startIndex = Math.max(0, targetIndex - Math.floor(limit / 2));
      const endIndex = Math.min(response.data.length, startIndex + limit);
      const contextMessages = response.data.slice(startIndex, endIndex);

      return {
        messages: contextMessages,
        targetIndex: contextMessages.findIndex((msg) => msg.id === messageId),
        targetMessage,
      };
    },
    enabled: enabled && !!messageId && !!conversationId,
    // Don't refetch automatically - this is a one-time context load
    staleTime: Infinity,
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
  });

  return {
    messages: query.data?.messages ?? [],
    targetMessage: query.data?.targetMessage,
    targetIndex: query.data?.targetIndex ?? -1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
