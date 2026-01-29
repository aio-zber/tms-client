/**
 * MentionSuggestions Component
 * Dropdown showing conversation members when @ is typed in MessageInput
 * Supports @all to mention everyone, keyboard navigation, and click selection
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUserImageUrl } from '@/lib/imageUtils';
import type { ConversationMember } from '@/types/conversation';

export interface MentionSuggestion {
  id: string; // 'all' for @all, otherwise userId
  displayName: string;
  image?: string;
  isAll?: boolean;
}

interface MentionSuggestionsProps {
  members: ConversationMember[];
  filter: string; // Text typed after @
  selectedIndex: number;
  onSelect: (suggestion: MentionSuggestion) => void;
  onIndexChange: (index: number) => void;
  onSuggestionsChange?: (suggestions: MentionSuggestion[]) => void;
  visible: boolean;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function MentionSuggestions({
  members,
  filter,
  selectedIndex,
  onSelect,
  onIndexChange,
  onSuggestionsChange,
  visible,
}: MentionSuggestionsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Build suggestion list: @all first, then filtered members
  const suggestions: MentionSuggestion[] = [];

  // Add @all option
  if (!filter || 'all'.startsWith(filter.toLowerCase()) || 'everyone'.startsWith(filter.toLowerCase())) {
    suggestions.push({ id: 'all', displayName: 'all', isAll: true });
  }

  // Filter and add members
  const lowerFilter = filter.toLowerCase();
  for (const member of members) {
    const name = member.user?.name || member.user?.email || member.userId;
    if (!filter || name.toLowerCase().includes(lowerFilter)) {
      suggestions.push({
        id: member.userId,
        displayName: name,
        image: member.user?.image,
      });
    }
  }

  // Report suggestions list to parent for keyboard handling
  useEffect(() => {
    onSuggestionsChange?.(suggestions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.length, onSuggestionsChange]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Clamp index when suggestions change
  useEffect(() => {
    if (selectedIndex >= suggestions.length && suggestions.length > 0) {
      onIndexChange(0);
    }
  }, [suggestions.length, selectedIndex, onIndexChange]);

  const handleClick = useCallback(
    (suggestion: MentionSuggestion) => {
      onSelect(suggestion);
    },
    [onSelect]
  );

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30"
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.id}
          type="button"
          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            index === selectedIndex
              ? 'bg-viber-purple-bg dark:bg-viber-purple/20 text-viber-purple'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent textarea blur
            handleClick(suggestion);
          }}
          onMouseEnter={() => onIndexChange(index)}
        >
          {suggestion.isAll ? (
            <>
              <div className="w-7 h-7 rounded-full bg-viber-purple text-white flex items-center justify-center text-xs font-bold">
                @
              </div>
              <div>
                <span className="font-medium">@all</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">Notify everyone</span>
              </div>
            </>
          ) : (
            <>
              <Avatar className="w-7 h-7">
                <AvatarImage src={getUserImageUrl(suggestion.image)} alt={suggestion.displayName} />
                <AvatarFallback className="bg-viber-purple text-white text-[10px]">
                  {getInitials(suggestion.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium truncate">{suggestion.displayName}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
