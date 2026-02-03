/**
 * PollDisplay Component
 * Displays poll in message bubble with Viber styling
 */

'use client';

import { log } from '@/lib/logger';
import { useState } from 'react';
import { formatRelativeTime } from '@/lib/dateUtils';
import type { Poll } from '@/types/message';
import PollOption from './PollOption';
import toast from 'react-hot-toast';

interface PollDisplayProps {
  poll: Poll;
  onVote: (optionIds: string[]) => Promise<void>;
  onClose?: () => Promise<void>;
  isCreator?: boolean;
  getUserName?: (userId: string) => string;
}

export default function PollDisplay({
  poll,
  onVote,
  onClose,
  isCreator = false,
  getUserName,
}: PollDisplayProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [lastVoteTime, setLastVoteTime] = useState<number>(0);

  const handleOptionClick = async (optionId: string) => {
    if (poll.isClosed || isVoting) return;

    // Debounce: Prevent duplicate clicks within 300ms
    const now = Date.now();
    if (now - lastVoteTime < 300) {
      log.message.debug('Debouncing poll vote click');
      return;
    }
    setLastVoteTime(now);

    setIsVoting(true);
    try {
      if (poll.multipleChoice) {
        // Toggle vote for multiple choice
        const currentVotes = poll.userVotes || [];
        const newVotes = currentVotes.includes(optionId)
          ? currentVotes.filter(id => id !== optionId)
          : [...currentVotes, optionId];

        await onVote(newVotes);
      } else {
        // Replace vote for single choice
        await onVote([optionId]);
      }
    } catch (error) {
      log.error('Failed to vote:', error);
      toast.error('Failed to vote on poll');
    } finally {
      setIsVoting(false);
    }
  };

  const handleClosePoll = async () => {
    if (!isCreator || poll.isClosed || !onClose) return;

    const confirmed = confirm('Are you sure you want to close this poll? This action cannot be undone.');
    if (!confirmed) return;

    setIsClosing(true);
    try {
      await onClose();
      toast.success('Poll closed successfully');
    } catch (error) {
      log.error('Failed to close poll:', error);
      toast.error('Failed to close poll');
    } finally {
      setIsClosing(false);
    }
  };

  const getTimeRemaining = () => {
    if (!poll.expiresAt) return null;

    const expiresDate = new Date(poll.expiresAt);
    const now = new Date();

    if (expiresDate <= now) return 'Expired';

    return `Closes ${formatRelativeTime(expiresDate)}`;
  };

  const timeRemaining = getTimeRemaining();

  return (
    <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl p-4 shadow-[0_2px_8px_rgba(115,96,242,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
      {/* Poll Question */}
      <div className="mb-3">
        <div className="flex items-start gap-2">
          <span className="text-2xl">📊</span>
          <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text leading-snug flex-1">
            {poll.question}
          </h3>
        </div>
      </div>

      {/* Poll Options */}
      <div className="space-y-2 mb-4">
        {poll.options
          .sort((a, b) => a.position - b.position)
          .map((option) => (
            <PollOption
              key={option.id}
              option={option}
              totalVotes={poll.totalVotes}
              isVoted={(poll.userVotes || []).includes(option.id)}
              isClosed={poll.isClosed}
              onClick={() => handleOptionClick(option.id)}
              disabled={isVoting}
              getUserName={getUserName}
            />
          ))}
      </div>

      {/* Poll Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-text-secondary">
        <div className="flex items-center gap-2">
          <span>
            {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
          </span>
          {poll.multipleChoice && (
            <>
              <span>•</span>
              <span>Multiple answers</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {poll.isClosed && (
            <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-dark-received-bubble text-gray-500 dark:text-dark-text-secondary text-[11px] font-medium">
              Closed
            </span>
          )}
          {!poll.isClosed && timeRemaining && (
            <span className="text-gray-500 dark:text-dark-text-secondary">
              {timeRemaining}
            </span>
          )}
          {!poll.isClosed && isCreator && onClose && (
            <button
              onClick={handleClosePoll}
              disabled={isClosing}
              className="px-2 py-1 rounded-lg bg-transparent border border-gray-200 dark:border-dark-border text-gray-500 dark:text-dark-text-secondary text-[11px] font-medium cursor-pointer transition-all duration-200 hover:border-viber-purple hover:text-viber-purple"
            >
              {isClosing ? 'Closing...' : 'Close Poll'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
