/**
 * TanStack Query Client Configuration
 * Centralized query client with optimized defaults for the messaging app
 */

import { QueryClient } from '@tanstack/react-query';
import { checkAndClearCache } from './cacheVersion';

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
      // Smart retry logic: don't retry client errors, retry server errors once
      retry: (failureCount, error) => {
        const apiError = error as { statusCode?: number };

        // Don't retry client errors (400-499) - these won't succeed on retry
        if (apiError.statusCode && apiError.statusCode >= 400 && apiError.statusCode < 500) {
          return false;
        }

        // Retry server errors (500-599) and network errors once
        return failureCount < 1;
      },

      // Exponential backoff with cap at 30 seconds
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// Check and clear cache if schema version has changed (e.g., adding sequenceNumber field)
// This ensures users get fresh data after migrations without needing to manually clear cache
checkAndClearCache(queryClient);

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
