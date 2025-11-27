# Comprehensive Notification System Architecture Plan

## Executive Summary

This plan outlines a Messenger & Telegram-inspired notification system for the GCG Team Messaging App. The design follows existing codebase patterns (Zustand stores, Socket.io events, TanStack Query, react-hot-toast) and maintains strict file size limits.

**Key Principles:**
1. Reuse existing Socket.io connection (no new connections)
2. Follow feature-based structure pattern
3. Keep files under limits (components <300, hooks <200, services <500)
4. Security-first (TMS JWT auth, server-side validation, no sensitive data in browser notifications)
5. Simple and pragmatic (start with core features)

---

## 1. Notification Store Architecture (Zustand)

### File: `/src/store/notificationStore.ts` (~200 lines)

**State Shape:**
```typescript
interface NotificationState {
  // In-app notifications (toast history)
  notifications: InAppNotification[];
  unreadNotificationCount: number;
  
  // Notification preferences
  preferences: NotificationPreferences;
  
  // Muted conversations (local cache from server)
  mutedConversations: Set<string>;
  
  // Do-not-disturb mode
  dndEnabled: boolean;
  dndUntil?: Date;
  
  // Browser notification permission status
  browserNotificationPermission: 'default' | 'granted' | 'denied';
  
  // Actions
  addNotification: (notification: Omit<InAppNotification, 'id' | 'createdAt'>) => void;
  markNotificationAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  clearOldNotifications: (olderThanDays: number) => void;
  
  // Preferences
  updatePreferences: (preferences: Partial<NotificationPreferences>) => void;
  toggleMuteConversation: (conversationId: string, muteUntil?: Date) => void;
  isMuted: (conversationId: string) => boolean;
  
  // DND mode
  toggleDnd: (enabled: boolean, until?: Date) => void;
  isDndActive: () => boolean;
  
  // Browser notifications
  requestBrowserNotificationPermission: () => Promise<void>;
  updateBrowserNotificationPermission: (permission: NotificationPermission) => void;
  
  // Utility
  shouldShowNotification: (conversationId: string, notificationType: NotificationType) => boolean;
}

interface InAppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  createdAt: Date;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
}

type NotificationType = 
  | 'new_message'
  | 'mention'
  | 'reply'
  | 'reaction'
  | 'member_added'
  | 'member_removed'
  | 'conversation_updated'
  | 'system';

interface NotificationPreferences {
  // Global toggles
  inAppNotifications: boolean;
  browserNotifications: boolean;
  soundEnabled: boolean;
  
  // Per-type preferences
  notifications: {
    newMessages: boolean;
    mentions: boolean;
    replies: boolean;
    reactions: boolean;
    groupActivity: boolean;
  };
  
  // Sound preferences
  sound: {
    volume: number; // 0-1
    customSound?: string; // URL to custom sound
  };
}
```

**Implementation Notes:**
- Store notifications in localStorage (max 100 recent notifications, auto-cleanup)
- Persist preferences and muted conversations to localStorage
- Integrate with existing authStore for user-specific preferences
- Use devtools middleware for debugging

**Decision Rationale:**
- Single store keeps notification logic centralized
- Set<string> for mutedConversations provides O(1) lookup
- Priority levels allow for smart notification grouping
- Metadata field allows extensibility without schema changes

---

## 2. Socket.io Event Strategy

### Reuse Existing Events (No New Events Needed!)

The existing Socket.io setup in `/src/lib/socket.ts` already handles all events we need:

**Events Already Supported:**
- `new_message` - triggers notification for new messages
- `message_edited` - (optional: notify on edits)
- `reaction_added` - triggers notification for reactions
- `reaction_removed` - (optional: remove notification)
- `member_added` - triggers notification for group activity
- `member_removed` - triggers notification for group activity
- `member_left` - triggers notification for group activity
- `conversation_updated` - triggers notification for conversation changes
- `message_status` - (no notification, just status update)
- `message_read` - (no notification, just status update)

**New Fields to Extract from Existing Events:**
- Detect @mentions in `new_message.content` (parse content for @userId or @all)
- Detect replies from `new_message.replyTo` or `new_message.replyToId`
- Extract sender info from event payload

**No Server Changes Required!** We just need smart client-side event handlers.

---

## 3. Component Structure

### 3.1 NotificationCenter Component
**File:** `/src/features/notifications/components/NotificationCenter.tsx` (~250 lines)

**Purpose:** Popover/dropdown showing notification history (like Messenger's notification icon)

**Features:**
- Click badge icon to open
- List of recent notifications (grouped by date)
- Mark as read/unread
- Clear all
- Click notification to navigate to conversation/message
- Empty state when no notifications

**Integration:**
- Place in AppHeader (next to user avatar)
- Badge shows unread count
- Auto-refresh when new notifications arrive

### 3.2 NotificationBadge Component
**File:** `/src/features/notifications/components/NotificationBadge.tsx` (~80 lines)

**Purpose:** Bell icon with unread count badge

**Features:**
- Animated shake on new notification
- Number badge (99+ if > 99)
- Click to open NotificationCenter

### 3.3 NotificationSettings Component
**File:** `/src/features/notifications/components/NotificationSettings.tsx` (~200 lines)

**Purpose:** Settings dialog for notification preferences

**Features:**
- Toggle in-app notifications
- Toggle browser notifications (with permission request)
- Toggle sound
- Volume slider
- Per-type notification toggles (mentions, replies, reactions, etc.)
- DND mode toggle with time picker
- Muted conversations list (with unmute button)

**Integration:**
- Add to ProfileSettingsPage as a new section/tab

### 3.4 NotificationToast Customization
**File:** `/src/features/notifications/components/NotificationToast.tsx` (~120 lines)

**Purpose:** Custom toast component for in-app notifications

**Features:**
- Avatar of sender
- Message preview (truncated)
- Click to navigate to conversation
- Swipe to dismiss
- Different styles for different notification types

**Integration:**
- Wrap react-hot-toast with custom rendering
- Add to root layout

---

## 4. Notification Types & Priorities

### Notification Matrix

| Event | Trigger | Priority | In-App Toast | Browser Notification | Sound |
|-------|---------|----------|--------------|---------------------|-------|
| **Direct Message** | `new_message` in DM | High | Yes | Yes (if not in conversation) | Yes |
| **Group Message** | `new_message` in group | Medium | Optional | Only if mentioned | Optional |
| **@Mention** | `new_message` with `@userId` | High | Yes | Yes | Yes |
| **@All** | `new_message` with `@all` | High | Yes | Yes | Yes |
| **Reply to Me** | `new_message.replyToId` = my message | High | Yes | Yes | Yes |
| **Reaction** | `reaction_added` on my message | Low | Yes (condensed) | No | No |
| **Member Added** | `member_added` | Medium | Yes | No | Optional |
| **Member Removed** | `member_removed` | Medium | Yes | No | No |
| **Conversation Updated** | `conversation_updated` | Low | Yes | No | No |

### Notification Grouping Strategy

**Group by conversation + time window:**
- If 3+ messages from same conversation within 30 seconds, group them
- Show "3 new messages from [Conversation Name]" instead of individual toasts
- Click grouped notification to navigate to conversation

**Condensed reactions:**
- Don't show individual reaction toasts
- Group reactions in NotificationCenter as "John and 2 others reacted to your message"

---

## 5. Browser Notification Strategy

### Permission Flow

**When to request permission:**
- When user enables browser notifications in settings (explicit opt-in)
- Show helpful dialog explaining benefits before requesting

**Permission states:**
1. **Default (not requested):** Show toggle as off, with "Enable" button
2. **Denied:** Show message "Browser notifications blocked. Enable in browser settings"
3. **Granted:** Show toggle as on, allow user to disable

### Notification Content (Security)

**Safe content (no sensitive data):**
```typescript
// ✅ GOOD - No message content in notification
{
  title: "John Doe",
  body: "Sent you a message",
  icon: "/app-icon.png", // Generic app icon, NOT user avatar
  tag: conversationId, // For grouping/replacing
  requireInteraction: false,
  silent: false
}

// ❌ BAD - Exposes message content
{
  title: "John Doe",
  body: "Here's the password: abc123", // NEVER DO THIS!
}
```

**Click Handling:**
```typescript
notification.onclick = () => {
  window.focus();
  // Navigate to conversation
  router.push(`/chats/${conversationId}`);
  notification.close();
};
```

**Rationale:**
- Message content could contain sensitive data (passwords, personal info)
- Browser notifications persist and can be seen by others
- Only show enough info to let user know who messaged them

---

## 6. Persistence Strategy

### What to Persist?

| Data | Storage | TTL | Size Limit |
|------|---------|-----|------------|
| **Notification History** | localStorage | 30 days | 100 notifications max |
| **Preferences** | localStorage + Server API | Infinite | <1KB |
| **Muted Conversations** | localStorage + Server API | Infinite | <5KB |
| **DND Mode** | localStorage | Until expiry | <100 bytes |
| **Browser Permission** | Memory (check Notification.permission) | Session | N/A |

### Server API Endpoints (Needed)

**Preferences API:**
```typescript
GET    /api/v1/notifications/preferences
PUT    /api/v1/notifications/preferences
POST   /api/v1/conversations/:id/mute
DELETE /api/v1/conversations/:id/mute
```

**Cache Invalidation:**
- Invalidate notification preferences query when updated
- Invalidate muted conversations when mute/unmute
- Clear localStorage on logout

**Sync Strategy:**
1. Load preferences from localStorage on mount (instant UI)
2. Fetch from server in background (refresh if different)
3. On update, optimistically update localStorage, then sync to server
4. On mute/unmute, immediately update local Set, then call API

---

## 7. File Organization

### New Feature Structure

```
src/features/notifications/
├── components/
│   ├── NotificationCenter.tsx         (~250 lines) - Main notification panel
│   ├── NotificationBadge.tsx          (~80 lines)  - Bell icon with badge
│   ├── NotificationSettings.tsx       (~200 lines) - Settings dialog
│   ├── NotificationToast.tsx          (~120 lines) - Custom toast component
│   ├── NotificationItem.tsx           (~150 lines) - Single notification in list
│   └── index.ts                       (exports)
├── hooks/
│   ├── useNotifications.ts            (~150 lines) - Main notification hook
│   ├── useNotificationSound.ts        (~100 lines) - Sound playback logic
│   ├── useBrowserNotifications.ts     (~120 lines) - Browser notification logic
│   ├── useNotificationEvents.ts       (~180 lines) - Socket.io event handlers
│   └── index.ts                       (exports)
├── services/
│   ├── notificationService.ts         (~200 lines) - API calls (preferences, mute)
│   ├── mentionParser.ts               (~80 lines)  - Parse @mentions from message content
│   └── index.ts                       (exports)
├── types.ts                           (~150 lines) - All notification types
└── index.ts                           (exports)

src/store/
└── notificationStore.ts               (~200 lines) - Zustand store

src/assets/sounds/                     (NEW)
└── notification.mp3                   (Notification sound file)
```

**Total New Files:** 15 files
**Total New Lines:** ~2,000 lines (well within budget)

---

## 8. Integration Points with Existing Code

### 8.1 Modifications to Existing Files

**File: `/src/app/layout.tsx`**
- Add NotificationProvider wrapper
- Add Toaster component for toast display
- Total changes: +5 lines

**File: `/src/features/chat/components/ChatHeader.tsx`**
- Add NotificationBadge component
- Total changes: +3 lines

**File: `/src/features/users/components/ProfileSettingsPage.tsx`**
- Add NotificationSettings tab
- Total changes: +8 lines

**File: `/src/lib/queryClient.ts`**
- Add notification query keys
- Total changes: +5 lines

**File: `/src/types/conversation.ts`**
- Already has isMuted/muteUntil fields
- No changes needed

**Total Lines Modified:** ~22 lines across 4 files

---

## 9. Critical Decision Points & Rationale

### Decision 1: Reuse Existing Socket.io Events vs. Create New Events
**Choice:** Reuse existing events
**Rationale:**
- No server changes required
- All needed data already in existing event payloads
- Client-side parsing for @mentions is simple and fast
- Reduces cross-repo coordination complexity

### Decision 2: Single notificationStore vs. Multiple Stores
**Choice:** Single notificationStore
**Rationale:**
- Notification logic is cohesive (preferences affect notification display)
- Easier to implement shouldShowNotification logic
- Follows existing pattern (authStore, userStore are single stores)
- File size well within 250 line limit

### Decision 3: Browser Notification Content (Sensitive Data)
**Choice:** Generic content only (no message text)
**Rationale:**
- Security: Message content could contain passwords, personal info
- Privacy: Browser notifications can be seen by others
- Compliance: Safer for enterprise/team environments
- UX: User clicks notification to see full message anyway

### Decision 4: Notification Persistence (localStorage vs. Server)
**Choice:** Hybrid approach (localStorage + server for preferences/mute)
**Rationale:**
- Notification history is ephemeral (30 days) - localStorage OK
- Preferences/mute need to sync across devices - server required
- Optimistic updates provide instant feedback
- Reduces server load (don't need to store notification history server-side)

### Decision 5: DND Mode (Client-only vs. Server-synced)
**Choice:** Client-only with localStorage persistence
**Rationale:**
- DND is device-specific (user may want notifications on mobile but not desktop)
- No server state to manage
- Simpler implementation
- Can upgrade to server-synced later if needed

### Decision 6: Sound Playback (Web Audio API vs. HTML5 Audio)
**Choice:** HTML5 Audio (<audio> element)
**Rationale:**
- Simpler API (new Audio().play())
- Browser compatibility (works in all modern browsers)
- No need for complex AudioContext setup
- Volume control easy with audio.volume

### Decision 7: @Mention Parsing (Client vs. Server)
**Choice:** Client-side parsing with regex
**Rationale:**
- Simple regex: /@(\w+)/g or /@all/
- Instant detection (no API call)
- Server doesn't need to store mention metadata
- Can enhance later with autocomplete/suggestions

---

## 10. Implementation Phases

### Phase 1: Core Infrastructure (Day 1-2)
**Goal:** Basic notification store and event handlers

**Tasks:**
1. Create notificationStore.ts with state and actions
2. Create useNotificationEvents.ts hook
3. Create notificationService.ts with API stubs
4. Add notification query keys to queryClient.ts
5. Test store actions and event handlers

**Deliverable:** Notifications triggered but not displayed yet

### Phase 2: In-App Notifications (Day 3-4)
**Goal:** Toast notifications working

**Tasks:**
1. Create NotificationToast.tsx custom component
2. Create NotificationProvider.tsx wrapper
3. Add Toaster to layout.tsx
4. Test toast display on new message
5. Implement notification grouping logic
6. Add sound playback with useNotificationSound.ts

**Deliverable:** Toast notifications appear on events

### Phase 3: Notification Center (Day 5-6)
**Goal:** Notification history panel

**Tasks:**
1. Create NotificationCenter.tsx component
2. Create NotificationBadge.tsx component
3. Create NotificationItem.tsx component
4. Add to ChatHeader.tsx
5. Implement mark as read, clear all
6. Test navigation on notification click

**Deliverable:** Full notification history accessible

### Phase 4: Preferences & Settings (Day 7-8)
**Goal:** User control over notifications

**Tasks:**
1. Create NotificationSettings.tsx component
2. Implement mute conversation logic
3. Implement DND mode
4. Create preference API endpoints (backend needed)
5. Add NotificationSettings to ProfileSettingsPage
6. Test all preference toggles

**Deliverable:** Users can customize notifications

### Phase 5: Browser Notifications (Day 9-10)
**Goal:** Native browser notifications

**Tasks:**
1. Create useBrowserNotifications.ts hook
2. Implement permission request flow
3. Add permission UI to NotificationSettings
4. Test browser notification display
5. Test click-to-navigate behavior
6. Test notification on inactive tab only

**Deliverable:** Browser notifications working

### Phase 6: Polish & Testing (Day 11-12)
**Goal:** Production-ready

**Tasks:**
1. Write unit tests for all hooks and services
2. Write component tests
3. Manual E2E testing
4. Fix bugs
5. Performance optimization (debounce, throttle)
6. Documentation

**Deliverable:** Tested, documented, ready to merge

---

## Critical Files for Implementation

### Top 5 Most Critical Files

1. **`/src/store/notificationStore.ts`** - Core state management
   - Central source of truth for all notification logic
   - Must be implemented first (all other files depend on it)
   - Pattern to follow: `/src/store/authStore.ts` (similar Zustand structure)

2. **`/src/features/notifications/hooks/useNotificationEvents.ts`** - Socket.io integration
   - Bridges existing Socket.io events to notification system
   - Critical for real-time notification triggering
   - Pattern to follow: `/src/features/messaging/hooks/useMessages.ts` (Socket.io event handlers)

3. **`/src/features/notifications/components/NotificationToast.tsx`** - User-facing UI
   - First visible piece of notification system
   - Must match Viber/Messenger UX patterns
   - Pattern to follow: `/src/features/messaging/components/MessageBubble.tsx` (avatar + content layout)

4. **`/src/features/notifications/services/notificationService.ts`** - API integration
   - Handles preferences sync with backend
   - Mute/unmute conversation actions
   - Pattern to follow: `/src/features/messaging/services/messageService.ts` (API call structure)

5. **`/src/features/notifications/components/NotificationCenter.tsx`** - Notification history
   - Main notification management UI
   - Complex component (list, filtering, mark as read, navigation)
   - Pattern to follow: `/src/features/messaging/components/MessageList.tsx` (virtual scrolling, infinite load)

---

## Success Criteria

### Functional Requirements
- New messages trigger in-app toast notifications
- @mentions are detected and prioritized
- Browser notifications appear when tab is inactive
- Notification center shows recent notification history
- Users can mute/unmute conversations
- DND mode silences all notifications
- Sound plays on high-priority notifications
- Clicking notification navigates to conversation

### Non-Functional Requirements
- All components under file size limits (<300 lines)
- All hooks under file size limits (<200 lines)
- All services under file size limits (<500 lines)
- No new Socket.io connections created
- No new npm dependencies required
- Test coverage >70% for critical paths
- No performance regressions

### User Experience
- Notifications feel snappy (appear within 200ms of event)
- No notification spam (smart grouping works)
- Settings are intuitive and easy to find
- Browser notifications respect privacy (no message content)
- Sound is not annoying (can be disabled/volume adjusted)

---

## Conclusion

This notification system design:
- ✅ Follows existing codebase patterns (Zustand, Socket.io, TanStack Query)
- ✅ Reuses existing infrastructure (no new connections or dependencies)
- ✅ Maintains strict file size limits
- ✅ Prioritizes security (no sensitive data in browser notifications)
- ✅ Provides Messenger/Telegram-inspired UX
- ✅ Is simple and pragmatic (start with core features)
- ✅ Has clear implementation phases (12-day plan)
- ✅ Includes comprehensive testing strategy

**Total Implementation Effort:** ~12 days for full-featured notification system
**Bundle Impact:** ~15-20KB (minimal)
**Backend Changes Required:** 3 API endpoints (or localStorage fallback)
**Risk Level:** Low (leverages existing patterns)

Ready to implement! 🚀
