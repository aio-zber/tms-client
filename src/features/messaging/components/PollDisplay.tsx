/**
 * PollDisplay Component
 * Displays poll in message bubble with Viber styling
 */

'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Poll } from '@/types/message';
import PollOption from './PollOption';
import toast from 'react-hot-toast';

const VIBER_COLORS = {
  primary: '#7360F2',
  accent: '#A18CFF',
  voted: '#00C853',
  background: '#F5F4F8',
  border: '#E4E3EB',
  textPrimary: '#2D2C3C',
  textSecondary: '#8B8A97',
};

interface PollDisplayProps {
  poll: Poll;
  onVote: (optionIds: string[]) => Promise<void>;
  onClose?: () => Promise<void>;
  currentUserId?: string;
  isCreator?: boolean;
}

export default function PollDisplay({
  poll,
  onVote,
  onClose,
  currentUserId,
  isCreator = false,
}: PollDisplayProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleOptionClick = async (optionId: string) => {
    if (poll.isClosed || isVoting) return;

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
      console.error('Failed to vote:', error);
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
      console.error('Failed to close poll:', error);
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

    return `Closes ${formatDistanceToNow(expiresDate, { addSuffix: true })}`;
  };

  const timeRemaining = getTimeRemaining();

  return (
    <div
      style={{
        background: 'white',
        border: `1px solid ${VIBER_COLORS.border}`,
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(115, 96, 242, 0.08)',
      }}
    >
      {/* Poll Question */}
      <div className="mb-3">
        <div className="flex items-start gap-2">
          <span className="text-2xl">📊</span>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: VIBER_COLORS.textPrimary,
              lineHeight: '1.4',
              flex: 1,
            }}
          >
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
            />
          ))}
      </div>

      {/* Poll Footer */}
      <div
        className="flex items-center justify-between"
        style={{
          fontSize: '12px',
          color: VIBER_COLORS.textSecondary,
        }}
      >
        <div className="flex items-center gap-2">
          <span>
            {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
          </span>
          <span>•</span>
          <span>Anonymous</span>
          {poll.multipleChoice && (
            <>
              <span>•</span>
              <span>Multiple answers</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {poll.isClosed && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '8px',
                background: VIBER_COLORS.background,
                color: VIBER_COLORS.textSecondary,
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              Closed
            </span>
          )}
          {!poll.isClosed && timeRemaining && (
            <span style={{ color: VIBER_COLORS.textSecondary }}>
              {timeRemaining}
            </span>
          )}
          {!poll.isClosed && isCreator && onClose && (
            <button
              onClick={handleClosePoll}
              disabled={isClosing}
              style={{
                padding: '4px 8px',
                borderRadius: '8px',
                background: 'transparent',
                border: `1px solid ${VIBER_COLORS.border}`,
                color: VIBER_COLORS.textSecondary,
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 200ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = VIBER_COLORS.primary;
                e.currentTarget.style.color = VIBER_COLORS.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = VIBER_COLORS.border;
                e.currentTarget.style.color = VIBER_COLORS.textSecondary;
              }}
            >
              {isClosing ? 'Closing...' : 'Close Poll'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
