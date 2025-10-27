# In-Chatbox Search - Quick Start

## 5-Minute Integration

### 1. Import
```typescript
import { ChatSearchBar, useChatSearch, useJumpToMessage } from '@/features/messaging';
```

### 2. Setup Hooks
```typescript
const [searchOpen, setSearchOpen] = useState(false);

const { jumpToMessage, registerMessageRef, searchHighlightId, clearSearchHighlight } =
  useJumpToMessage();

const { searchQuery } = useChatSearch({
  conversationId,
  enabled: searchOpen,
  onResultSelect: (id) => jumpToMessage(id, { isSearchResult: true }),
});

// Ctrl+F shortcut
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setSearchOpen(!searchOpen);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [searchOpen]);

// Clear highlight on close
useEffect(() => {
  if (!searchOpen) clearSearchHighlight();
}, [searchOpen, clearSearchHighlight]);
```

### 3. Add Search Bar
```tsx
<ChatSearchBar
  conversationId={conversationId}
  isOpen={searchOpen}
  onClose={() => setSearchOpen(false)}
  onResultSelect={(id) => jumpToMessage(id, { isSearchResult: true })}
/>
```

### 4. Update Messages
```tsx
<Message
  {...existingProps}
  searchQuery={searchQuery}
  isSearchHighlighted={searchHighlightId === message.id}
  messageRef={(el) => registerMessageRef(message.id, el)}
/>
```

## Keyboard Shortcuts
- `Ctrl/Cmd + F` - Open search
- `Enter` - Next result
- `Shift + Enter` - Previous result
- `Esc` - Close

## Done! 🎉

See [IN_CHATBOX_SEARCH_INTEGRATION.md](../../../docs/IN_CHATBOX_SEARCH_INTEGRATION.md) for full documentation.
