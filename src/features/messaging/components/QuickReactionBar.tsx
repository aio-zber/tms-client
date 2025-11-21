/**
 * QuickReactionBar Component
 * Messenger-style quick emoji selector that appears on message hover
 * Provides 1-click reactions for improved UX
 * Now with smooth animations via Framer Motion
 */

'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { EmojiPickerButton } from './EmojiPickerButton';

interface QuickReactionBarProps {
  onReact: (emoji: string) => void;
  isSent: boolean;
}

// Quick reaction emojis (Messenger/Telegram pattern)
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const QuickReactionBar = memo(function QuickReactionBar({
  onReact,
  isSent,
}: QuickReactionBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{
        type: "spring",
        damping: 25,
        stiffness: 400,
        duration: 0.2
      }}
      className={`absolute z-10 bg-white rounded-full shadow-lg border border-gray-200 p-1 flex items-center gap-1 ${
        isSent ? 'right-0 top-[-40px]' : 'left-0 top-[-40px]'
      }`}
      onClick={(e) => e.stopPropagation()} // Prevent message selection
    >
      {QUICK_EMOJIS.map((emoji, index) => (
        <motion.button
          key={emoji}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: index * 0.03, // Stagger animation
            type: "spring",
            damping: 20,
            stiffness: 500
          }}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onReact(emoji)}
          className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-lg md:text-xl"
          title={`React with ${emoji}`}
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </motion.button>
      ))}

      {/* More reactions button (opens full emoji picker) */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: QUICK_EMOJIS.length * 0.03, // Appear last
          type: "spring",
          damping: 20,
          stiffness: 500
        }}
      >
        <EmojiPickerButton
          onEmojiSelect={onReact}
          triggerClassName="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
          triggerIcon={
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 15s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"
              />
            </svg>
          }
          side="top"
          align="center"
          ariaLabel="More reactions"
        />
      </motion.div>
    </motion.div>
  );
});
