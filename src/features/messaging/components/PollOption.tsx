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
  background: '#F5F4F8',
  border: '#E4E3EB',
  textPrimary: '#2D2C3C',
  textSecondary: '#8B8A97',
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

  const buttonStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    padding: '12px 16px',
    borderRadius: '12px',
    border: isVoted ? 'none' : `1px solid ${VIBER_COLORS.border}`,
    background: isVoted
      ? `linear-gradient(135deg, ${VIBER_COLORS.primary}, ${VIBER_COLORS.accent})`
      : VIBER_COLORS.background,
    color: isVoted ? 'white' : VIBER_COLORS.textPrimary,
    cursor: isClosed || disabled ? 'default' : 'pointer',
    transition: 'all 200ms ease',
    overflow: 'hidden',
    boxShadow: isVoted ? `0 4px 12px rgba(115, 96, 242, 0.25)` : 'none',
  };

  const progressBarStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    width: `${percentage}%`,
    background: isVoted
      ? 'rgba(255, 255, 255, 0.2)'
      : `linear-gradient(135deg, ${VIBER_COLORS.primary}15, ${VIBER_COLORS.accent}15)`,
    transition: 'width 300ms ease-out',
    zIndex: 0,
  };

  const contentStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  };

  const handleClick = () => {
    if (!isClosed && !disabled) {
      onClick();
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        style={buttonStyle}
        className="poll-option"
        disabled={isClosed || disabled}
        onMouseEnter={(e) => {
          if (!isClosed && !disabled && !isVoted) {
            e.currentTarget.style.background = '#ECECF4';
            e.currentTarget.style.borderColor = VIBER_COLORS.primary;
          }
        }}
        onMouseLeave={(e) => {
          if (!isClosed && !disabled && !isVoted) {
            e.currentTarget.style.background = VIBER_COLORS.background;
            e.currentTarget.style.borderColor = VIBER_COLORS.border;
          }
        }}
      >
        {/* Progress Bar Background */}
        <div style={progressBarStyle} />

        {/* Content */}
        <div style={contentStyle}>
          <div className="flex items-center gap-2 flex-1">
            {/* Checkmark for voted option */}
            {isVoted && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: VIBER_COLORS.voted,
                  flexShrink: 0,
                }}
              >
                <Check className="h-3 w-3 text-white" />
              </div>
            )}

            {/* Option Text */}
            <span
              className="text-left font-medium"
              style={{
                fontSize: '14px',
                lineHeight: '1.4',
              }}
            >
              {option.optionText}
            </span>
          </div>

          {/* Vote Count & Percentage */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {totalVotes > 0 && (
              <>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: isVoted ? 'white' : VIBER_COLORS.primary,
                  }}
                >
                  {percentage}%
                </span>
                <div
                  style={{
                    padding: '4px 8px',
                    borderRadius: '8px',
                    background: isVoted ? 'rgba(255, 255, 255, 0.2)' : 'rgba(115, 96, 242, 0.08)',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: isVoted ? 'white' : VIBER_COLORS.primary,
                  }}
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
        <div
          className="mt-1 ml-3 text-xs"
          style={{
            color: VIBER_COLORS.textSecondary,
            fontSize: '11px',
          }}
        >
          {votersText}
        </div>
      )}
    </div>
  );
}
