'use client';

import React from 'react';
import EmojiPicker, {
  EmojiClickData,
  Theme,
  Categories,
  EmojiStyle
} from 'emoji-picker-react';

interface CustomEmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  className?: string;
}

export function CustomEmojiPicker({ onEmojiSelect, className }: CustomEmojiPickerProps) {
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onEmojiSelect(emojiData.emoji);
  };

  return (
    <div className={className}>
      <EmojiPicker
        onEmojiClick={handleEmojiClick}
        theme={Theme.LIGHT}
        emojiStyle={EmojiStyle.NATIVE}
        searchPlaceHolder="Search emojis..."
        width="100%"
        height="400px"
        previewConfig={{
          showPreview: false
        }}
        skinTonesDisabled={true}
        categories={[
          {
            category: Categories.SUGGESTED,
            name: 'Recently Used'
          },
          {
            category: Categories.SMILEYS_PEOPLE,
            name: 'Smileys & People'
          },
          {
            category: Categories.ANIMALS_NATURE,
            name: 'Animals & Nature'
          },
          {
            category: Categories.FOOD_DRINK,
            name: 'Food & Drink'
          },
          {
            category: Categories.TRAVEL_PLACES,
            name: 'Travel & Places'
          },
          {
            category: Categories.ACTIVITIES,
            name: 'Activities'
          },
          {
            category: Categories.OBJECTS,
            name: 'Objects'
          },
          {
            category: Categories.SYMBOLS,
            name: 'Symbols'
          },
          {
            category: Categories.FLAGS,
            name: 'Flags'
          }
        ]}
        style={{
          '--epr-emoji-size': '28px',
          '--epr-category-label-height': '40px',
          '--epr-header-padding': '12px',
          '--epr-search-input-height': '40px',
          '--epr-picker-border-radius': '12px',
          '--epr-bg-color': '#ffffff',
          '--epr-category-label-bg-color': '#f9fafb',
          '--epr-hover-bg-color': '#f3f4f6',
          '--epr-search-input-bg-color': '#f9fafb',
          '--epr-search-border-color': '#e5e7eb',
          '--epr-highlight-color': '#7360F2', // Viber purple
        } as React.CSSProperties}
      />
    </div>
  );
}
