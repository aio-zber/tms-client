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
          // When keepOpen=true, only prevent closing if clicking INSIDE the picker
          // Allow closing when clicking outside (anywhere except the picker panel)
          const target = e.target as HTMLElement;
          const isClickInsidePicker = target.closest('[role="dialog"]');

          if (keepOpen && isClickInsidePicker) {
            e.preventDefault(); // Keep open when clicking inside picker
          }
          // If clicking outside, let it close naturally (don't preventDefault)
        }}
      >
        <CustomEmojiPicker onEmojiSelect={handleEmojiSelect} />
      </PopoverContent>
    </Popover>
  );
}
