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
}

export function EmojiPickerButton({
  onEmojiSelect,
  triggerIcon,
  triggerClassName,
  side = 'top',
  align = 'end',
  ariaLabel = 'Select emoji'
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);

  const handleEmojiSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
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
      >
        <CustomEmojiPicker onEmojiSelect={handleEmojiSelect} />
      </PopoverContent>
    </Popover>
  );
}
