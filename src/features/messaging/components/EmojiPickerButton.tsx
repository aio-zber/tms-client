'use client';

import { log } from '@/lib/logger';
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

  const handleOpenChange = (newOpen: boolean) => {
    log.message.debug('[EmojiPickerButton] handleOpenChange called:', { newOpen, keepOpen, currentOpen: open });

    // Always allow opening
    if (newOpen) {
      setOpen(true);
      return;
    }

    // When closing and keepOpen is false, allow it
    if (!keepOpen) {
      setOpen(false);
      return;
    }

    // When keepOpen is true and trying to close, ignore it
    // The picker will only close via onPointerDownOutside or ESC key
    log.message.debug('[EmojiPickerButton] Blocking auto-close because keepOpen=true');
    return;
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
        className="w-[95vw] sm:w-[350px] max-w-[400px] p-0 border-none shadow-lg"
        sideOffset={5}
        collisionPadding={10}
        onPointerDownOutside={(e) => {
    log.message.debug('[EmojiPickerButton] onPointerDownOutside fired', { keepOpen });

          if (!keepOpen) return; // If not keepOpen, use default behavior

          // When keepOpen=true, only close on clicks truly outside the picker
          const target = e.target as HTMLElement;
    log.message.debug('[EmojiPickerButton] Click target:', target);

          const isInsidePicker =
            target.closest('[data-radix-popper-content-wrapper]') ||
            target.closest('.EmojiPickerReact') ||
            target.closest('[class*="emoji"]');

    log.message.debug('[EmojiPickerButton] isInsidePicker:', isInsidePicker);

          if (!isInsidePicker) {
            // Real click outside - close the picker
    log.message.debug('[EmojiPickerButton] Click outside detected - closing picker');
            setOpen(false);
          } else {
    log.message.debug('[EmojiPickerButton] Click inside detected - staying open');
          }
          // If inside picker, do nothing (let the picker handle it)
        }}
        onEscapeKeyDown={() => {
    log.message.debug('[EmojiPickerButton] ESC key pressed - closing picker');
          setOpen(false);
        }}
      >
        <CustomEmojiPicker onEmojiSelect={handleEmojiSelect} />
      </PopoverContent>
    </Popover>
  );
}
