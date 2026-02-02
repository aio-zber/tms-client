/**
 * PollOption Component
 * Individual poll option with Viber styling
 */

'use client';

import { Check } from 'lucide-react';
import type { PollOption as PollOptionType } from '@/types/message';

const VIBER_COLORS = {
  primary: '#7360F2',
  accent: '#A18CFF',
  voted: '#00C853',
};

interface PollOptionProps {
  option: PollOptionType;
  totalVotes: number;
  isVoted: boolean;
  isClosed: boolean;
  onClick: () => void;
  disabled?: boolean;
  getUserName?: (userId: string) => string;
}

export default function PollOption({
  option,
  totalVotes,
  isVoted,
  isClosed,
  onClick,
  disabled = false,
  getUserName,
}: PollOptionProps) {
  const percentage = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0;

  // Get voter names
  const voterNames = option.voters && getUserName
    ? option.voters.map((userId) => getUserName(userId)).filter(Boolean)
    : [];

  const votersText = voterNames.length > 0
    ? voterNames.length <= 3
      ? voterNames.join(', ')
      : `${voterNames.slice(0, 3).join(', ')} +${voterNames.length - 3} more`
    : null;

  const handleClick = () => {
    if (!isClosed && !disabled) {
      onClick();
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        className={`poll-option relative w-full px-4 py-3 rounded-xl overflow-hidden transition-all duration-200 ${
          isVoted
            ? 'border-0 text-white shadow-[0_4px_12px_rgba(115,96,242,0.25)]'
            : 'border border-gray-200 dark:border-dark-border bg-gray-100 dark:bg-dark-received-bubble text-gray-900 dark:text-dark-text hover:bg-gray-200 dark:hover:bg-[#3A3A3C] hover:border-viber-purple'
        }`}
        style={isVoted ? { background: `linear-gradient(135deg, ${VIBER_COLORS.primary}, ${VIBER_COLORS.accent})` } : undefined}
        disabled={isClosed || disabled}
      >
        {/* Progress Bar Background */}
        <div
          className="absolute left-0 top-0 h-full transition-[width] duration-300 ease-out"
          style={{
            width: `${percentage}%`,
            background: isVoted
              ? 'rgba(255, 255, 255, 0.2)'
              : `linear-gradient(135deg, rgba(115,96,242,0.08), rgba(161,140,255,0.08))`,
            zIndex: 0,
          }}
        />

        {/* Content */}
        <div className="relative z-[1] flex justify-between items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            {/* Checkmark for voted option */}
            {isVoted && (
              <div
                className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
                style={{ background: VIBER_COLORS.voted }}
              >
                <Check className="h-3 w-3 text-white" />
              </div>
            )}

            {/* Option Text */}
            <span className="text-left font-medium text-sm leading-snug">
              {option.optionText}
            </span>
          </div>

          {/* Vote Count & Percentage */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {totalVotes > 0 && (
              <>
                <span
                  className={`text-sm font-medium ${isVoted ? 'text-white' : 'text-viber-purple'}`}
                >
                  {percentage}%
                </span>
                <div
                  className={`px-2 py-1 rounded-lg text-xs font-medium ${
                    isVoted
                      ? 'bg-white/20 text-white'
                      : 'bg-viber-purple/[0.08] text-viber-purple'
                  }`}
                >
                  {option.voteCount}
                </div>
              </>
            )}
          </div>
        </div>
      </button>

      {/* Voters List - Shown below the option like Telegram */}
      {votersText && (
        <div className="mt-1 ml-3 text-[11px] text-gray-500 dark:text-dark-text-secondary">
          {votersText}
        </div>
      )}
    </div>
  );
}
