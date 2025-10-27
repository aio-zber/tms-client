/**
 * usePollActions Hook
 * Handles poll actions with optimistic updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pollService, type CreatePollRequest } from '../services/pollService';
import toast from 'react-hot-toast';

export function usePollActions() {
  const queryClient = useQueryClient();

  /**
   * Create a new poll
   */
  const createPoll = useMutation({
    mutationFn: (data: CreatePollRequest) => pollService.createPoll(data),
    onSuccess: (data, variables) => {
      // Invalidate messages query for the conversation
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.conversation_id],
      });
    },
    onError: (error) => {
      console.error('Failed to create poll:', error);
      toast.error('Failed to create poll');
    },
  });

  /**
   * Vote on a poll (with optimistic updates)
   */
  const voteOnPoll = useMutation({
    mutationFn: ({ pollId, optionIds }: { pollId: string; optionIds: string[] }) =>
      pollService.voteOnPoll(pollId, { option_ids: optionIds }),
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
      console.error('Failed to vote on poll:', error);
      toast.error('Failed to vote on poll');
    },
    onSuccess: (data) => {
      // Update with server data
      queryClient.setQueryData(['poll', data.poll.id], data.poll);

      // Also update the poll data in messages cache
      queryClient.invalidateQueries({
        queryKey: ['messages'],
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
      console.error('Failed to close poll:', error);
      toast.error('Failed to close poll');
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
