# In-Chatbox Message Search Integration Guide

## Overview

This guide explains how to integrate the Telegram/Messenger-style in-chatbox search functionality into your chat views.

## Features

- ✅ **Inline Search Bar** - Compact search UI in chat header
- ✅ **Real-time Search** - 300ms debounced search as you type
- ✅ **Result Navigation** - Navigate between matches with arrows or keyboard
- ✅ **Jump to Message** - Smooth scroll and highlight found messages
- ✅ **Search Highlighting** - Yellow highlight for matches (Telegram style)
- ✅ **Keyboard Shortcuts** - Ctrl/Cmd+F, Enter, Shift+Enter, Esc
- ✅ **Result Counter** - "3 of 12 results" display
- ✅ **Persistent Highlight** - Keep current result highlighted

## Components Created

### 1. ChatSearchBar (`src/features/messaging/components/ChatSearchBar.tsx`)
Telegram-style inline search bar with navigation controls.

### 2. useChatSearch Hook (`src/features/messaging/hooks/useChatSearch.ts`)
Manages search state, API calls, and navigation logic.

### 3. Enhanced useJumpToMessage Hook (`src/features/messaging/hooks/useJumpToMessage.ts`)
Scroll to messages with search highlighting support.

### 4. Enhanced Message Component (`src/features/chat/components/Message.tsx`)
Now supports search highlighting props.

## Integration Steps

### Step 1: Import Required Components and Hooks

```typescript
import { ChatSearchBar, useChatSearch, useJumpToMessage } from '@/features/messaging';
```

### Step 2: Set Up Search State in Your Chat View

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ChatSearchBar, useChatSearch, useJumpToMessage } from '@/features/messaging';
import Message from '@/features/chat/components/Message';

export default function ChatPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;

  // Search state management
  const {
    isSearchOpen,
    searchQuery,
    currentIndex,
    totalResults,
    openSearch,
    closeSearch,
    toggleSearch,
  } = useChatSearch({
    conversationId,
    enabled: true,
    onResultSelect: (messageId) => {
      jumpToMessage(messageId, { isSearchResult: true });
    },
  });

  // Jump to message functionality
  const {
    jumpToMessage,
    highlightedMessageId,
    searchHighlightId,
    registerMessageRef,
    clearSearchHighlight,
  } = useJumpToMessage();

  // Global keyboard shortcut (Ctrl/Cmd + F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  // Clear search highlight when closing search
  useEffect(() => {
    if (!isSearchOpen) {
      clearSearchHighlight();
    }
  }, [isSearchOpen, clearSearchHighlight]);

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header with Search Bar */}
      <div className="border-b border-gray-200">
        {/* Regular header content (title, etc.) */}
        {!isSearchOpen && (
          <div className="p-4 flex items-center justify-between">
            <h2 className="font-semibold">Chat Title</h2>
            <button
              onClick={openSearch}
              className="p-2 hover:bg-gray-100 rounded"
              title="Search (Ctrl+F)"
            >
              <SearchIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Search Bar */}
        <ChatSearchBar
          conversationId={conversationId}
          isOpen={isSearchOpen}
          onClose={closeSearch}
          onResultSelect={(messageId) => {
            jumpToMessage(messageId, { isSearchResult: true });
          }}
        />
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            isOwnMessage={message.sender_id === currentUserId}
            showAvatar={true}
            currentUserId={currentUserId}
            // Search-related props
            searchQuery={searchQuery}
            isHighlighted={highlightedMessageId === message.id}
            isSearchHighlighted={searchHighlightId === message.id}
            messageRef={(el) => registerMessageRef(message.id, el)}
          />
        ))}
      </div>

      {/* Message Input */}
      <div className="border-t border-gray-200 p-4">
        {/* Your message input component */}
      </div>
    </div>
  );
}
```

### Step 3: Update Message Component Props

Ensure your Message components receive these props:

```typescript
<Message
  // ... existing props
  searchQuery={searchQuery}                          // Current search query for highlighting
  isHighlighted={highlightedMessageId === message.id} // Temporary highlight (pulse animation)
  isSearchHighlighted={searchHighlightId === message.id} // Persistent search result highlight
  messageRef={(el) => registerMessageRef(message.id, el)} // Ref for scrolling
/>
```

## API Integration

The ChatSearchBar component uses the existing search API:

```typescript
POST /api/v1/messages/search

Request Body:
{
  "query": "search term",
  "conversation_id": "uuid",
  "limit": 100
}

Response:
{
  "data": [ /* array of messages */ ],
  "pagination": {
    "has_more": false,
    "limit": 100
  }
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + F` | Open/close search |
| `Enter` | Navigate to next result |
| `Shift + Enter` | Navigate to previous result |
| `Esc` | Close search |

## Styling

### Search Highlights
- **Match highlight**: `bg-yellow-200` (bright yellow for text matches)
- **Active result**: `bg-yellow-100 border-2 border-yellow-400` (highlighted message bubble)
- **Temporary pulse**: `animate-pulse` (when jumping to message)

### Customization
You can customize colors by updating Tailwind classes in:
- `ChatSearchBar.tsx` - Search bar styling
- `Message.tsx` - Highlight colors

## Performance Considerations

1. **Debouncing**: Search queries are debounced by 300ms to reduce API calls
2. **Result Limit**: Limited to 100 results for optimal performance
3. **React Query**: Results cached for 5 minutes (configurable in useChatSearch)

## Troubleshooting

### Search not working
- Verify `conversation_id` is correct
- Check that the search API endpoint is accessible
- Ensure PostgreSQL full-text search indexes exist (see backend CLAUDE.md)

### Messages not scrolling
- Verify `messageRef` callback is properly attached
- Check that message IDs match between search results and rendered messages

### Highlights not appearing
- Ensure `searchQuery`, `isHighlighted`, and `isSearchHighlighted` props are passed
- Check that Message component is using the updated version with highlight support

## Example: Minimal Integration

For a quick integration, here's the minimal code:

```typescript
import { ChatSearchBar, useChatSearch, useJumpToMessage } from '@/features/messaging';

export default function ChatView({ conversationId }: { conversationId: string }) {
  const [searchOpen, setSearchOpen] = useState(false);

  const { jumpToMessage, registerMessageRef, searchHighlightId } = useJumpToMessage();

  const { searchQuery } = useChatSearch({
    conversationId,
    enabled: searchOpen,
    onResultSelect: (id) => jumpToMessage(id, { isSearchResult: true }),
  });

  return (
    <>
      <ChatSearchBar
        conversationId={conversationId}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onResultSelect={(id) => jumpToMessage(id, { isSearchResult: true })}
      />

      {/* Your messages */}
      {messages.map(msg => (
        <Message
          key={msg.id}
          message={msg}
          searchQuery={searchQuery}
          isSearchHighlighted={searchHighlightId === msg.id}
          messageRef={(el) => registerMessageRef(msg.id, el)}
        />
      ))}
    </>
  );
}
```

## Backend Requirements

The backend already has everything needed:
- ✅ Full-text search indexes on `messages.content`
- ✅ Trigram similarity for fuzzy matching
- ✅ GIN indexes for performance
- ✅ Auto-updating search vectors

No backend changes required!

## Next Steps

1. **Test the integration** in your chat view
2. **Customize styling** to match your brand colors
3. **Add search history** (optional enhancement)
4. **Add advanced filters** (optional enhancement)

## Reference

- Backend API: See [tms-server/app/api/v1/messages.py:673-729](../../../tms-server/app/api/v1/messages.py)
- Search Repository: See [tms-server/app/repositories/message_repo.py:147-270](../../../tms-server/app/repositories/message_repo.py)
- Database Indexes: See migration [20251021_0814-fe956b638cc9_add_fulltext_search_indexes.py](../../../tms-server/alembic/versions/)
