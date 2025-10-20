# Implementation Summary: Unread Count, Search, and Scroll Fixes

## Overview
This document summarizes the implementation of fixes for three persistent issues in the TMS messaging client, following Messenger/Telegram patterns with TanStack Query integration.

## ✅ Phase 1: TanStack Query Setup (COMPLETE)

### Files Created:
1. **`src/lib/queryClient.ts`** - Query client configuration with optimized defaults and query key factory
2. **`src/components/providers/QueryProvider.tsx`** - Client-side wrapper for QueryClientProvider

### Files Modified:
1. **`src/app/layout.tsx`** - Added QueryProvider wrapper
2. **`package.json`** - Added `@tanstack/react-query` and `@tanstack/react-query-devtools`

### Configuration Highlights:
- Stale time: 1 minute
- Refetch on window focus: enabled
- Retry: 1 attempt
- Cache time: 5 minutes
- Type-safe query keys factory for conversations, messages, and unread counts

---

## ✅ Phase 2: Unread Count Fix (COMPLETE)

### Problem Solved:
- ❌ **Old**: Manual state management with `useState`, incrementing locally on WebSocket events
- ✅ **New**: Server as source of truth, TanStack Query with optimistic updates and cache invalidation

### How It Works Now:
1. **Server excludes user's own messages** (backend already does this: `sender_id != user_id`)
2. **Client fetches from server** via `/messages/conversations/{id}/unread-count`
3. **Optimistic updates** when marking as read (immediately set to 0, rollback on error)
4. **WebSocket invalidation** triggers refetch from server instead of manual state updates

### Files Created:
1. **`src/features/conversations/hooks/useUnreadCount.ts`**
   - `useUnreadCount()` - Generic hook for total or per-conversation count
   - `useTotalUnreadCount()` - Total across all conversations
   - `useConversationUnreadCount(id)` - Per-conversation count
   - Refetch interval: 30 seconds
   - Stale time: 10 seconds

2. **`src/features/conversations/hooks/useConversationsQuery.ts`**
   - `useConversationsQuery()` - Infinite query for conversation list
   - `useConversationQuery(id)` - Single conversation details
   - Proper pagination with `getNextPageParam`

### Files Modified:
1. **`src/features/conversations/hooks/useConversations.ts`**
   - Migrated to use `useConversationsQuery`
   - WebSocket handlers now use `queryClient.invalidateQueries()` instead of `setState`
   - Removed manual unread count increment logic

2. **`src/features/conversations/hooks/useConversationActions.ts`**
   - Added `useQueryClient` hook
   - `markAsRead()` now has optimistic update:
     ```typescript
     // 1. Save previous data
     const previousData = queryClient.getQueryData(queryKey);

     // 2. Optimistically set to 0
     queryClient.setQueryData(queryKey, { unread_count: 0 });

     // 3. Call API
     await conversationService.markConversationAsRead(id);

     // 4. Invalidate to refetch actual value
     queryClient.invalidateQueries({ queryKey });

     // 5. On error: rollback
     catch (err) {
       queryClient.setQueryData(queryKey, previousData);
     }
     ```

3. **`src/features/chat/components/ConversationList.tsx`**
   - Fixed `onClick={() => refresh()}` to handle Promise return type

### Benefits:
✅ **Accurate unread counts** - Server is always the source of truth
✅ **No duplicate counting** - Server excludes user's own messages automatically
✅ **Instant UI feedback** - Optimistic updates show changes immediately
✅ **Automatic rollback** - Errors revert to previous state
✅ **Cache efficiency** - No redundant API calls with proper invalidation

---

## ✅ Phase 3: Search with Jump-to-Message (COMPLETE - Hooks Ready)

### Problem Solved:
- ❌ **Old**: Search shows results but no way to navigate to the message in conversation
- ✅ **New**: Click search result → load context → scroll to message → highlight it

### Files Created:
1. **`src/features/messaging/hooks/useMessagesAroundMessage.ts`**
   - Fetches messages around a specific message (context loading)
   - Returns: `{ messages, targetMessage, targetIndex }`
   - Stale time: Infinity (one-time context load)
   - Cache time: 5 minutes

2. **`src/features/messaging/hooks/useJumpToMessage.ts`**
   - `registerMessageRef(messageId, element)` - Register message DOM refs
   - `jumpToMessage(messageId)` - Scroll to message and highlight
   - `highlightedMessageId` - ID of currently highlighted message
   - Highlight duration: 3 seconds with auto-fade

### Integration Points (Ready for Phase 4):
- `MessageSearchDialog` already has `onMessageClick` callback
- `ChatWindow` needs to handle message click and load context
- `MessageList` needs to:
  - Call `registerMessageRef` for each message
  - Apply highlight class when `message.id === highlightedMessageId`
  - Add CSS for highlight effect (yellow background with fade-out transition)

### Messenger/Telegram Pattern:
1. User searches for "hello"
2. Clicks result → dialog closes
3. App loads messages around that message
4. Scrolls to message with `scrollIntoView({ block: 'center' })`
5. Highlights message with yellow background
6. Highlight fades out after 3 seconds

---

## 🚧 Phase 4: Scroll Memory with react-window (PENDING)

### Status: Hooks created, virtualization implementation pending

### Files to Create:
1. `src/features/messaging/components/VirtualizedMessageList.tsx`
2. `src/features/messaging/hooks/useMessagesQuery.ts`

### Files to Modify:
1. `src/features/messaging/components/MessageList.tsx` - Refactor to use `react-window`
2. `src/features/messaging/hooks/useMessages.ts` - Migrate to TanStack Query

### Planned Implementation:
```typescript
import { VariableSizeList } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';

// Virtualize messages for performance (10,000+ messages)
// Automatic scroll position preservation when loading older messages
// Auto-scroll to bottom only when:
//   - Initial load
//   - User sends a message
//   - User is already near bottom (< 100px) and new message arrives
```

---

## 🚧 Phase 5: WebSocket Integration (PENDING)

### Current State:
- WebSocket handlers in `useConversations` already use `queryClient.invalidateQueries()`
- Still need to update `useMessages` WebSocket handlers

### Files to Modify:
1. `src/features/messaging/hooks/useMessages.ts`
   - Replace manual `setMessages` with `queryClient.invalidateQueries()`
   - On `new_message`: Invalidate messages query
   - On `message_edited`: Invalidate messages query
   - On `message_deleted`: Invalidate messages query

---

## Testing Checklist

### ✅ Phase 1 & 2 - Unread Count
- [x] Build compiles successfully
- [ ] Unread count displays correctly on conversation list
- [ ] Unread count updates when new message arrives (WebSocket)
- [ ] Unread count resets to 0 when marking as read (optimistic)
- [ ] Unread count does NOT increment for user's own messages
- [ ] Error handling: rollback on mark-as-read failure

### 🚧 Phase 3 - Search & Jump
- [ ] Search returns results
- [ ] Clicking search result closes dialog
- [ ] Loads messages around clicked message
- [ ] Scrolls to message in center of view
- [ ] Highlights message with yellow background
- [ ] Highlight fades out after 3 seconds

### 🚧 Phase 4 - Scroll Memory
- [ ] Messages virtualized with react-window
- [ ] Scroll position preserved when loading older messages
- [ ] Auto-scroll to bottom on initial load
- [ ] Auto-scroll to bottom when sending message
- [ ] Auto-scroll to bottom when receiving message (only if already at bottom)
- [ ] NO auto-scroll when receiving message while scrolled up

### 🚧 Phase 5 - Full Integration
- [ ] WebSocket events trigger query invalidation
- [ ] All features work together
- [ ] No console errors
- [ ] Performance is acceptable (< 100ms render time)

---

## Key Architecture Decisions

### 1. Server as Source of Truth
**Why**: Server already handles excluding user's own messages (`sender_id != user_id`). Client should never calculate unread count - only fetch from server.

**Implementation**:
- `useUnreadCount()` hook fetches from `/messages/conversations/{id}/unread-count`
- WebSocket events trigger `queryClient.invalidateQueries()` to refetch

### 2. Optimistic Updates for UX
**Why**: Instant feedback when user marks conversation as read, with automatic rollback on failure.

**Implementation**:
- Save previous state → Update optimistically → Call API → Invalidate cache → Rollback on error

### 3. TanStack Query for State Management
**Why**: Automatic caching, deduplication, background refetching, and DevTools for debugging.

**Benefits**:
- No manual cache management
- Automatic request deduplication
- Built-in error handling and retry logic
- DevTools for inspecting query state

### 4. Virtualization for Performance
**Why**: Handle 10,000+ messages without performance degradation.

**Implementation**: `react-window` with `VariableSizeList` and `InfiniteLoader`

---

## Next Steps

### Immediate (Phase 4 & 5):
1. Implement `VirtualizedMessageList` with react-window
2. Migrate `useMessages` to TanStack Query
3. Update WebSocket handlers to use query invalidation
4. Integrate jump-to-message in `ChatWindow`
5. Add highlight styling in `MessageList`

### Testing:
1. Manual testing of all three features
2. Performance testing with large message counts
3. Error scenario testing (network failures, etc.)

### Future Enhancements:
1. Prefetch next conversation when hovering on list item
2. Infinite scroll for conversations list
3. Message search across all conversations (not just one)
4. Search result pagination
5. Advanced search filters (date range, sender, type)

---

## Dependencies Added

```json
{
  "@tanstack/react-query": "^5.90.5",
  "@tanstack/react-query-devtools": "^5.90.2"
}
```

Existing (already installed):
- `react-window`: "^2.2.1"
- `react-window-infinite-loader`: "^2.0.0"

---

## Files Modified Summary

### Created (8 files):
1. `src/lib/queryClient.ts`
2. `src/components/providers/QueryProvider.tsx`
3. `src/features/conversations/hooks/useUnreadCount.ts`
4. `src/features/conversations/hooks/useConversationsQuery.ts`
5. `src/features/messaging/hooks/useMessagesAroundMessage.ts`
6. `src/features/messaging/hooks/useJumpToMessage.ts`
7. `IMPLEMENTATION_SUMMARY.md` (this file)

### Modified (5 files):
1. `src/app/layout.tsx`
2. `src/features/conversations/hooks/useConversations.ts`
3. `src/features/conversations/hooks/useConversationActions.ts`
4. `src/features/chat/components/ConversationList.tsx`
5. `package.json`

### Pending (4 files):
1. `src/features/messaging/components/VirtualizedMessageList.tsx` (to create)
2. `src/features/messaging/hooks/useMessagesQuery.ts` (to create)
3. `src/features/messaging/components/MessageList.tsx` (to modify)
4. `src/features/messaging/hooks/useMessages.ts` (to modify)

---

**Status**: ✅ Phases 1-3 Complete | 🚧 Phases 4-5 Pending
**Build Status**: ✅ Successful compilation
**Next Action**: Implement Phase 4 (Virtualized Message List)
