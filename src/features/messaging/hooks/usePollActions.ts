/**
 * usePollActions Hook
 * Handles poll actions with optimistic updates
 */

import { log } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pollService, type CreatePollRequest } from '../services/pollService';
import toast from 'react-hot-toast';
import { getErrorMessage, ERROR_CONTEXTS } from '@/lib/errorMessages';
import { queryKeys } from '@/lib/queryClient';

export function usePollActions() {
  const queryClient = useQueryClient();

  /**
   * Create a new poll
   */
  const createPoll = useMutation({
    mutationFn: (data: CreatePollRequest) => pollService.createPoll(data),
    onSuccess: (data, variables) => {
      // Invalidate messages query using proper query key structure
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(variables.conversation_id, { limit: 50 }),
      });
    },
    onError: (error) => {
      log.message.error('Failed to create poll:', error);
      toast.error(getErrorMessage(error, ERROR_CONTEXTS.POLL_CREATE));
    },
  });

  /**
   * Vote on a poll (with optimistic updates)
   */
  const voteOnPoll = useMutation({
    mutationFn: ({ pollId, optionIds }: { pollId: string; optionIds: string[] }) =>
      pollService.voteOnPoll(pollId, { option_ids: optionIds }),

    // Retry 500 errors once (backend will be idempotent)
    retry: (failureCount, error) => {
      const apiError = error as { response?: { status?: number } };
      if (apiError?.response?.status === 500 && failureCount < 1) {
        return true;
      }
      return false;
    },

    onMutate: async ({ pollId, optionIds }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['poll', pollId] });

      // Snapshot previous value
      const previousPoll = queryClient.getQueryData(['poll', pollId]);

      // Optimistically update poll data
      queryClient.setQueryData(['poll', pollId], (old: unknown) => {
        if (!old || typeof old !== 'object') return old;

        return {
          ...(old as Record<string, unknown>),
          userVotes: optionIds,
        };
      });

      return { previousPoll };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousPoll) {
        queryClient.setQueryData(['poll', variables.pollId], context.previousPoll);
      }
      log.message.error('Failed to vote on poll:', error);

      // Only show error toast for non-500 errors (500s will retry)
      const apiError = error as { response?: { status?: number } };
      if (apiError?.response?.status !== 500) {
        toast.error(getErrorMessage(error, ERROR_CONTEXTS.POLL_VOTE));
      }
    },
    onSuccess: (data) => {
      // Update with server data
      queryClient.setQueryData(['poll', data.poll.id], data.poll);

      // Also update the poll data in messages cache
      queryClient.invalidateQueries({
        queryKey: ['messages'],
      });

      // No success toast - WebSocket handles notification
    },
    onSettled: (data, error, variables) => {
      // Fallback: Always refetch poll data to ensure consistency
      queryClient.invalidateQueries({
        queryKey: ['poll', variables.pollId],
      });
    },
  });

  /**
   * Close a poll (only creator)
   */
  const closePoll = useMutation({
    mutationFn: (pollId: string) => pollService.closePoll(pollId),
    onSuccess: (data) => {
      // Update poll data
      queryClient.setQueryData(['poll', data.id], data);

      // Invalidate messages to refresh poll display
      queryClient.invalidateQueries({
        queryKey: ['messages'],
      });

      toast.success('Poll closed successfully');
    },
    onError: (error) => {
      log.message.error('Failed to close poll:', error);
      toast.error(getErrorMessage(error, ERROR_CONTEXTS.POLL_CLOSE));
    },
  });

  return {
    createPoll: createPoll.mutateAsync,
    voteOnPoll: voteOnPoll.mutateAsync,
    closePoll: closePoll.mutateAsync,
    isCreatingPoll: createPoll.isPending,
    isVoting: voteOnPoll.isPending,
    isClosing: closePoll.isPending,
  };
}

export default usePollActions;
