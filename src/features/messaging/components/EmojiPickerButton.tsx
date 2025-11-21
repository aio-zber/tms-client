'use client';

import React, { useState } from 'react';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CustomEmojiPicker } from '@/components/ui/emoji-picker';

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  triggerIcon?: React.ReactNode;
  triggerClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  ariaLabel?: string;
  keepOpen?: boolean; // Keep picker open after selection (for message input)
}

export function EmojiPickerButton({
  onEmojiSelect,
  triggerIcon,
  triggerClassName,
  side = 'top',
  align = 'end',
  ariaLabel = 'Select emoji',
  keepOpen = false
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);

  const handleEmojiSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    // Only auto-close if keepOpen is false (for reactions)
    // Keep open if keepOpen is true (for message input multiple emoji selection)
    if (!keepOpen) {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={triggerClassName}
          aria-label={ariaLabel}
        >
          {triggerIcon || <Smile className="h-5 w-5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-full p-0 border-none shadow-lg"
        sideOffset={5}
        onInteractOutside={(e) => {
          if (!keepOpen) return; // If not keepOpen, allow default close behavior

          // When keepOpen=true, only allow closing if clicking truly OUTSIDE
          const target = e.target as HTMLElement;

          // Check if click is inside the popover content (emoji picker panel)
          const popoverContent = target.closest('[data-radix-popper-content-wrapper]');
          const emojiPicker = target.closest('.EmojiPickerReact') || target.closest('[class*="emoji"]');

          if (popoverContent || emojiPicker) {
            // Click is inside picker - prevent closing
            e.preventDefault();
          }
          // Otherwise, allow closing (click is outside)
        }}
      >
        <CustomEmojiPicker onEmojiSelect={handleEmojiSelect} />
      </PopoverContent>
    </Popover>
  );
}
