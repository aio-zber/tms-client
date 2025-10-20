/**
 * TanStack Query Client Configuration
 * Centralized query client with optimized defaults for the messaging app
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 1 minute
      staleTime: 1000 * 60,

      // Automatically refetch when window regains focus
      refetchOnWindowFocus: true,

      // Retry failed requests once
      retry: 1,

      // Refetch interval for real-time-ish data (disabled by default)
      refetchInterval: false,

      // Keep unused data in cache for 5 minutes
      gcTime: 1000 * 60 * 5,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});

// Query Keys Factory for type-safe and consistent query keys
export const queryKeys = {
  // Conversations
  conversations: {
    all: ['conversations'] as const,
    lists: () => [...queryKeys.conversations.all, 'list'] as const,
    list: (filters: { limit?: number; offset?: number; type?: 'dm' | 'group' }) =>
      [...queryKeys.conversations.lists(), filters] as const,
    details: () => [...queryKeys.conversations.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.conversations.details(), id] as const,
  },

  // Messages
  messages: {
    all: ['messages'] as const,
    lists: () => [...queryKeys.messages.all, 'list'] as const,
    list: (conversationId: string, filters?: { limit?: number; cursor?: string }) =>
      [...queryKeys.messages.lists(), conversationId, filters] as const,
    details: () => [...queryKeys.messages.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.messages.details(), id] as const,
    search: (query: string, filters?: { conversation_id?: string }) =>
      [...queryKeys.messages.all, 'search', query, filters] as const,
    around: (messageId: string, conversationId: string) =>
      [...queryKeys.messages.all, 'around', messageId, conversationId] as const,
  },

  // Unread counts
  unreadCount: {
    all: ['unread-count'] as const,
    total: () => [...queryKeys.unreadCount.all, 'total'] as const,
    conversation: (conversationId: string) =>
      [...queryKeys.unreadCount.all, 'conversation', conversationId] as const,
  },
};
