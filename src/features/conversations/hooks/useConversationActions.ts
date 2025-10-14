/**
 * useConversationActions Hook
 * Handles conversation CRUD operations and member management
 */

import { useState, useCallback } from 'react';
import { conversationService } from '../services/conversationService';
import type {
  Conversation,
  CreateConversationRequest,
  UpdateConversationRequest,
  UpdateConversationSettingsRequest,
} from '@/types/conversation';

interface UseConversationActionsReturn {
  createConversation: (data: CreateConversationRequest) => Promise<Conversation | null>;
  updateConversation: (
    conversationId: string,
    data: UpdateConversationRequest
  ) => Promise<Conversation | null>;
  addMembers: (conversationId: string, memberIds: string[]) => Promise<boolean>;
  removeMember: (conversationId: string, memberId: string) => Promise<boolean>;
  leaveConversation: (conversationId: string) => Promise<boolean>;
  updateSettings: (
    conversationId: string,
    settings: UpdateConversationSettingsRequest
  ) => Promise<boolean>;
  markAsRead: (conversationId: string) => Promise<boolean>;
  loading: boolean;
  error: Error | null;
}

export function useConversationActions(): UseConversationActionsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createConversation = useCallback(
    async (data: CreateConversationRequest) => {
      setLoading(true);
      setError(null);

      try {
        const conversation = await conversationService.createConversation(data);
        return conversation;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to create conversation:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateConversation = useCallback(
    async (conversationId: string, data: UpdateConversationRequest) => {
      setLoading(true);
      setError(null);

      try {
        const conversation = await conversationService.updateConversation(
          conversationId,
          data
        );
        return conversation;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to update conversation:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const addMembers = useCallback(
    async (conversationId: string, memberIds: string[]) => {
      setLoading(true);
      setError(null);

      try {
        await conversationService.addMembers(conversationId, {
          member_ids: memberIds,
        });
        return true;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to add members:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const removeMember = useCallback(
    async (conversationId: string, memberId: string) => {
      setLoading(true);
      setError(null);

      try {
        await conversationService.removeMember(conversationId, memberId);
        return true;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to remove member:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const leaveConversation = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);

    try {
      await conversationService.leaveConversation(conversationId);
      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to leave conversation:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(
    async (
      conversationId: string,
      settings: UpdateConversationSettingsRequest
    ) => {
      setLoading(true);
      setError(null);

      try {
        await conversationService.updateConversationSettings(
          conversationId,
          settings
        );
        return true;
      } catch (err) {
        setError(err as Error);
        console.error('Failed to update settings:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const markAsRead = useCallback(async (conversationId: string) => {
    setError(null);

    try {
      await conversationService.markConversationAsRead(conversationId);
      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to mark conversation as read:', err);
      return false;
    }
  }, []);

  return {
    createConversation,
    updateConversation,
    addMembers,
    removeMember,
    leaveConversation,
    updateSettings,
    markAsRead,
    loading,
    error,
  };
}
