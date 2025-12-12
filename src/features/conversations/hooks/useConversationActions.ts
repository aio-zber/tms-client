/**
 * useConversationActions Hook
 * Handles conversation CRUD operations and member management
 * Now using TanStack Query mutations for consistent error handling
 */

import { log } from '@/lib/logger';
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationService } from '../services/conversationService';
import { queryKeys } from '@/lib/queryClient';
import toast from 'react-hot-toast';
import { getErrorMessage, ERROR_CONTEXTS } from '@/lib/errorMessages';
import type {
  Conversation,
  CreateConversationRequest,
  UpdateConversationRequest,
  UpdateConversationSettingsRequest,
} from '@/types/conversation';

interface UseConversationActionsReturn {
  createConversation: (data: CreateConversationRequest) => Promise<Conversation | null>;
  updateConversation: (conversationId: string, data: UpdateConversationRequest) => void;
  updateConversationAsync: (conversationId: string, data: UpdateConversationRequest) => Promise<Conversation>;
  addMembers: (conversationId: string, memberIds: string[]) => void;
  addMembersAsync: (conversationId: string, memberIds: string[]) => Promise<Conversation>;
  removeMember: (conversationId: string, memberId: string) => void;
  removeMemberAsync: (conversationId: string, memberId: string) => Promise<void>;
  leaveConversation: (conversationId: string) => void;
  leaveConversationAsync: (conversationId: string) => Promise<void>;
  updateSettings: (conversationId: string, settings: UpdateConversationSettingsRequest) => void;
  updateSettingsAsync: (conversationId: string, settings: UpdateConversationSettingsRequest) => Promise<Conversation>;
  markAsRead: (conversationId: string) => Promise<boolean>;

  isUpdating: boolean;
  isAddingMembers: boolean;
  isRemovingMember: boolean;
  isLeaving: boolean;
  isUpdatingSettings: boolean;
}

export function useConversationActions(): UseConversationActionsReturn {
  const queryClient = useQueryClient();

  /**
   * Create a new conversation (keep as-is, needs immediate return value)
   */
  const createConversation = useCallback(
    async (data: CreateConversationRequest) => {
      try {
        const conversation = await conversationService.createConversation(data);
        return conversation;
      } catch (err) {
        log.message.error('Failed to create conversation:', err);
        return null;
      }
    },
    []
  );

  /**
   * Update conversation (name, avatar, etc.)
   */
  const updateConversationMutation = useMutation({
    mutationFn: ({ conversationId, data }: {
      conversationId: string;
      data: UpdateConversationRequest
    }) => conversationService.updateConversation(conversationId, data),
    onSuccess: (data, variables) => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });

      toast.success('Conversation updated successfully');
    },
    onError: (error, variables) => {
      log.message.error('Failed to update conversation:', error);
      toast.error(getErrorMessage(error, ERROR_CONTEXTS.CONVERSATION_UPDATE));
    },
    onSettled: (data, error, variables) => {
      // Fallback: Always refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
    },
  });

  /**
   * Add members to conversation
   */
  const addMembersMutation = useMutation({
    mutationFn: ({ conversationId, memberIds }: {
      conversationId: string;
      memberIds: string[]
    }) => conversationService.addMembers(conversationId, { user_ids: memberIds }),
    onSuccess: (data, variables) => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });

      toast.success('Members added successfully');
    },
    onError: (error, variables) => {
      log.message.error('Failed to add members:', error);
      toast.error(getErrorMessage(error, ERROR_CONTEXTS.MEMBER_ADD));
    },
    onSettled: (data, error, variables) => {
      // Fallback: Always refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
    },
  });

  /**
   * Remove member from conversation
   */
  const removeMemberMutation = useMutation({
    mutationFn: ({ conversationId, memberId }: {
      conversationId: string;
      memberId: string
    }) => conversationService.removeMember(conversationId, memberId),
    onSuccess: (data, variables) => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });

      toast.success('Member removed');
    },
    onError: (error, variables) => {
      log.message.error('Failed to remove member:', error);
      toast.error(getErrorMessage(error, ERROR_CONTEXTS.MEMBER_REMOVE));
    },
    onSettled: (data, error, variables) => {
      // Fallback: Always refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
    },
  });

  /**
   * Leave conversation
   */
  const leaveConversationMutation = useMutation({
    mutationFn: (conversationId: string) =>
      conversationService.leaveConversation(conversationId),
    onSuccess: (data, conversationId) => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });

      toast.success('Left conversation');
    },
    onError: (error, conversationId) => {
      log.message.error('Failed to leave conversation:', error);
      toast.error(getErrorMessage(error, ERROR_CONTEXTS.MEMBER_LEAVE));
    },
    onSettled: (data, error, conversationId) => {
      // Fallback: Always refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(conversationId),
      });
    },
  });

  /**
   * Update conversation settings
   */
  const updateSettingsMutation = useMutation({
    mutationFn: ({ conversationId, settings }: {
      conversationId: string;
      settings: UpdateConversationSettingsRequest
    }) => conversationService.updateConversationSettings(conversationId, settings),
    onSuccess: (data, variables) => {
      // Invalidate queries to refetch updated data
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });

      toast.success('Settings updated');
    },
    onError: (error, variables) => {
      log.message.error('Failed to update settings:', error);
      toast.error(getErrorMessage(error, ERROR_CONTEXTS.CONVERSATION_SETTINGS));
    },
    onSettled: (data, error, variables) => {
      // Fallback: Always refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
    },
  });

  /**
   * Mark conversation as read (keep with optimistic updates)
   */
  const markAsRead = useCallback(async (conversationId: string) => {
    // Optimistic update: immediately set unread count to 0
    const previousData = queryClient.getQueryData(
      queryKeys.unreadCount.conversation(conversationId)
    );

    // Optimistically update to 0
    queryClient.setQueryData(
      queryKeys.unreadCount.conversation(conversationId),
      { unread_count: 0, conversation_id: conversationId }
    );

    try {
      await conversationService.markConversationAsRead(conversationId);

      // On success, invalidate to refetch actual count from server
      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.conversation(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.unreadCount.total(),
      });

      return true;
    } catch (err) {
      log.message.error('Failed to mark conversation as read:', err);

      // Rollback on error
      if (previousData) {
        queryClient.setQueryData(
          queryKeys.unreadCount.conversation(conversationId),
          previousData
        );
      }

      return false;
    }
  }, [queryClient]);

  return {
    createConversation,
    updateConversation: (conversationId: string, data: UpdateConversationRequest) =>
      updateConversationMutation.mutate({ conversationId, data }),
    updateConversationAsync: (conversationId: string, data: UpdateConversationRequest) =>
      updateConversationMutation.mutateAsync({ conversationId, data }),
    addMembers: (conversationId: string, memberIds: string[]) =>
      addMembersMutation.mutate({ conversationId, memberIds }),
    addMembersAsync: (conversationId: string, memberIds: string[]) =>
      addMembersMutation.mutateAsync({ conversationId, memberIds }),
    removeMember: (conversationId: string, memberId: string) =>
      removeMemberMutation.mutate({ conversationId, memberId }),
    removeMemberAsync: (conversationId: string, memberId: string) =>
      removeMemberMutation.mutateAsync({ conversationId, memberId }),
    leaveConversation: (conversationId: string) =>
      leaveConversationMutation.mutate(conversationId),
    leaveConversationAsync: (conversationId: string) =>
      leaveConversationMutation.mutateAsync(conversationId),
    updateSettings: (conversationId: string, settings: UpdateConversationSettingsRequest) =>
      updateSettingsMutation.mutate({ conversationId, settings }),
    updateSettingsAsync: (conversationId: string, settings: UpdateConversationSettingsRequest) =>
      updateSettingsMutation.mutateAsync({ conversationId, settings }),
    markAsRead,

    isUpdating: updateConversationMutation.isPending,
    isAddingMembers: addMembersMutation.isPending,
    isRemovingMember: removeMemberMutation.isPending,
    isLeaving: leaveConversationMutation.isPending,
    isUpdatingSettings: updateSettingsMutation.isPending,
  };
}
