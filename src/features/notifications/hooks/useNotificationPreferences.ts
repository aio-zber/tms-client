/**
 * useNotificationPreferences Hook
 * Syncs notification preferences with backend using TanStack Query
 * Pattern: Follows existing query hooks with server sync
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotificationStore } from '@/store/notificationStore';
import { notificationService } from '../services/notificationService';
import type { NotificationPreferences, NotificationPreferencesUpdate } from '../types';
import { log } from '@/lib/logger';
import toast from 'react-hot-toast';

// Query keys
const QUERY_KEYS = {
  preferences: ['notifications', 'preferences'] as const,
  mutedConversations: ['notifications', 'muted-conversations'] as const,
};

/**
 * Hook to fetch and sync notification preferences
 */
export function useNotificationPreferences() {
  const queryClient = useQueryClient();
  const setPreferences = useNotificationStore((state) => state.setPreferences);
  const setMutedConversations = useNotificationStore((state) => state.setMutedConversations);

  // Fetch preferences from server
  const {
    data: preferences,
    isLoading,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.preferences,
    queryFn: async () => {
      const prefs = await notificationService.getNotificationPreferences();
      // Sync to local store
      setPreferences(prefs);
      return prefs;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 2,
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: (updates: NotificationPreferencesUpdate) =>
      notificationService.updateNotificationPreferences(updates),
    onMutate: async (updates) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.preferences });

      // Snapshot previous value
      const previousPreferences = queryClient.getQueryData<NotificationPreferences>(
        QUERY_KEYS.preferences
      );

      // Optimistically update local store
      const currentPreferences = useNotificationStore.getState().preferences;
      useNotificationStore.getState().updatePreferences(updates);

      // Optimistically update cache
      queryClient.setQueryData<NotificationPreferences>(
        QUERY_KEYS.preferences,
        (old) => (old ? { ...old, ...updates } : currentPreferences)
      );

      return { previousPreferences };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousPreferences) {
        queryClient.setQueryData(QUERY_KEYS.preferences, context.previousPreferences);
        useNotificationStore.getState().setPreferences(context.previousPreferences);
      }

      log.notification.error('Failed to update preferences:', error);
      toast.error('Failed to update notification preferences');
    },
    onSuccess: (data) => {
      // Update cache with server response
      queryClient.setQueryData(QUERY_KEYS.preferences, data);
      useNotificationStore.getState().setPreferences(data);

      log.notification.info('Preferences updated successfully');
      toast.success('Notification preferences updated');
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.preferences });
    },
  });

  // Fetch muted conversations
  const { data: mutedConversations } = useQuery({
    queryKey: QUERY_KEYS.mutedConversations,
    queryFn: async () => {
      const muted = await notificationService.getMutedConversations();
      // Sync to local store
      setMutedConversations(muted);
      return muted;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  // Mute conversation mutation
  const muteConversationMutation = useMutation({
    mutationFn: (conversationId: string) =>
      notificationService.muteConversation(conversationId),
    onMutate: async (conversationId) => {
      // Optimistically update local store
      useNotificationStore.getState().muteConversation(conversationId);

      // Update cache
      const previousMuted = queryClient.getQueryData<string[]>(QUERY_KEYS.mutedConversations);
      queryClient.setQueryData<string[]>(QUERY_KEYS.mutedConversations, (old) =>
        old ? [...old, conversationId] : [conversationId]
      );

      return { previousMuted };
    },
    onError: (error, _conversationId, context) => {
      if (context?.previousMuted) {
        queryClient.setQueryData(QUERY_KEYS.mutedConversations, context.previousMuted);
      }
      log.notification.error('Failed to mute conversation:', error);
      toast.error('Failed to mute conversation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mutedConversations });
      toast.success('Conversation muted');
    },
  });

  // Unmute conversation mutation
  const unmuteConversationMutation = useMutation({
    mutationFn: (conversationId: string) =>
      notificationService.unmuteConversation(conversationId),
    onMutate: async (conversationId) => {
      // Optimistically update local store
      useNotificationStore.getState().unmuteConversation(conversationId);

      // Update cache
      const previousMuted = queryClient.getQueryData<string[]>(QUERY_KEYS.mutedConversations);
      queryClient.setQueryData<string[]>(QUERY_KEYS.mutedConversations, (old) =>
        old ? old.filter((id) => id !== conversationId) : []
      );

      return { previousMuted };
    },
    onError: (error, _conversationId, context) => {
      if (context?.previousMuted) {
        queryClient.setQueryData(QUERY_KEYS.mutedConversations, context.previousMuted);
      }
      log.notification.error('Failed to unmute conversation:', error);
      toast.error('Failed to unmute conversation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mutedConversations });
      toast.success('Conversation unmuted');
    },
  });

  return {
    // Data
    preferences,
    mutedConversations,
    isLoading,
    error,

    // Mutations
    updatePreferences: updatePreferencesMutation.mutate,
    muteConversation: muteConversationMutation.mutate,
    unmuteConversation: unmuteConversationMutation.mutate,

    // Mutation states
    isUpdatingPreferences: updatePreferencesMutation.isPending,
    isMutingConversation: muteConversationMutation.isPending,
    isUnmutingConversation: unmuteConversationMutation.isPending,
  };
}
