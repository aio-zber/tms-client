# TMA Notification System Research Guide

## Executive Summary

Based on research of Telegram, Messenger, and Firebase implementations, this guide provides a comprehensive blueprint for implementing notifications in the Team Messaging App (TMA). The approach balances simplicity with industry best practices, avoiding over-engineering while ensuring robust, user-friendly notification delivery.

---

## 1. Notification Types Architecture

### Core Notification Categories

#### 1.1 Message Notifications
**Types:**
- **New Message**: Direct message or group message arrived
- **Mentioned Message**: User was @mentioned in a message
- **Reply Notification**: Someone replied to your message
- **Edited Message**: Message you received was edited (optional)
- **Deleted Message**: Message you received was deleted (optional)

**Telegram Implementation**: Sends separate notification types with loc_key identifiers. Payload includes user_id, chat_id, and minimal data to reduce bandwidth.

**Messenger Implementation**: Groups notifications intelligently; multiple messages from same user may be bundled into single notification.

**TMA Recommendation**: Implement as separate event types but use batching/grouping logic on client to combine related notifications (e.g., 3 messages from John → "John sent 3 messages").

#### 1.2 Conversation Notifications
**Types:**
- **Added to Group**: User was added to group conversation
- **Member Joined**: Other member joined group user belongs to
- **Member Left/Removed**: Member left or was removed from group
- **Group Name Changed**: Conversation name was updated
- **Group Avatar Changed**: Conversation avatar was updated

**Telegram Implementation**: Service messages (messageAction*) automatically inserted into chat history. Users control if these trigger notifications.

**TMA Recommendation**: Store as system messages in conversation history. Include setting to disable conversation notifications separately from message notifications.

#### 1.3 Call Notifications
**Types:**
- **Incoming Call**: User received voice/video call
- **Missed Call**: User missed incoming call while away
- **Call Ended**: Call session ended
- **Call Failed**: Call connection failed

**Firebase/Telegram Implementation**: High-priority notifications that should wake device. Includes unique identifiers to avoid duplicates.

**TMA Recommendation**: Mark as high-priority/urgent. Include unique call_id to deduplicate. Implement distinct visual treatment (different sound, badge color).

#### 1.4 System Notifications (Optional/Future)
- Connection status changes (online/offline)
- User typing indicators (in-app only)
- Message delivery status changes (in-app only)

**Recommendation**: Start with in-app only; can add push notifications later if needed.

---

## 2. Notification Delivery Architecture

### 2.1 Multi-Channel Delivery Strategy

```
┌─────────────────────────────────────────────────────┐
│           Server (FastAPI + Socket.io)              │
└────┬──────────────┬──────────────┬──────────────────┘
     │              │              │
     ↓              ↓              ↓
┌──────────┐  ┌─────────────┐  ┌──────────────┐
│ WebSocket│  │ In-App Push │  │ Device Push  │
│(Socket.io)  │(via REST)   │  │(FCM/APNs)    │
└──────────┘  └─────────────┘  └──────────────┘
     │              │              │
     ↓              ↓              ↓
┌──────────────────────────────────────────┐
│    Client App (Next.js + Socket.io)      │
│  - In-app toast/modal (highest priority) │
│  - Browser notification (web)            │
│  - Badge count                           │
│  - Sound/vibration                       │
└──────────────────────────────────────────┘
```

**Delivery Channels:**

1. **WebSocket (Real-time, Highest Priority)**
   - Used when app is open and connected
   - Instant delivery (< 100ms typical)
   - No user action needed
   - Best for: Conversation in active use

2. **In-App Notifications**
   - Toast notifications (bottom-right corner)
   - Modal dialogs for important events (incoming calls)
   - Notification center/history
   - Sound/vibration feedback
   - Badge count on conversation

3. **Browser Push Notifications (Web)**
   - Web Push Protocol with Service Workers
   - Displayed even when app tab closed
   - Works on: Chrome, Firefox, Edge, Safari
   - Encryption via VAPID keys

4. **Device Push Notifications (Mobile)**
   - Firebase Cloud Messaging (FCM) for Android
   - Apple Push Notification service (APNs) for iOS
   - Wakes device if needed
   - Device sound/vibration
   - Delivered even if app completely closed

### 2.2 Delivery Priority Strategy

**Telegram Model:**
- High-priority: Messages, missed calls
- Normal-priority: Reactions, group updates
- Silent: Delivery/read status (no notification)

**Firebase Model:**
- High-priority: Delivered immediately, may wake device
- Normal-priority: Delayed during Doze/sleep mode, conserves battery

**TMA Implementation:**

```
PRIORITY 1 (High - Urgent):
├── Incoming calls
├── Direct messages with mention
├── Direct messages (1-on-1 conversations)
└── Active group messages with mention

PRIORITY 2 (Normal - Standard):
├── Group messages (no mention)
├── Group updates (member joined, name changed)
├── Call missed/ended
└── Conversation added

PRIORITY 3 (Low - Background):
├── Delivery status (don't use push, in-app only)
├── Read status (don't use push, in-app only)
└── Message edited/deleted (in-app only)
```

**Rule**: Only deliver via device push if priority is 1 or 2. Priority 3 notifications never leave the app.

---

## 3. Notification Preferences System

### 3.1 Global Settings (User-Level)

**Critical Settings** (all users must configure):

```
┌─────────────────────────────────────────────┐
│   Global Notification Preferences           │
├─────────────────────────────────────────────┤
│ ☑ Enable All Notifications                 │
│   ├─ ☑ New Messages                        │
│   ├─ ☑ Mentions                            │
│   ├─ ☑ Replies to my messages              │
│   ├─ ☑ Group updates                       │
│   └─ ☑ Calls                               │
│                                             │
│ Do Not Disturb (DND)                       │
│ ◉ Off                                      │
│ ○ Until 8:00 AM                           │
│ ○ Until tomorrow                           │
│ ○ Custom time range                        │
│   From: [ ]  To: [ ]                       │
│                                             │
│ Sound                                      │
│ ◉ Default system sound                    │
│ ○ None (silent)                            │
│ ○ Custom ringtone (future)                │
│                                             │
│ Vibration                                  │
│ ☑ Enable vibration                        │
│                                             │
│ Badge Count                                │
│ ☑ Show unread badge on app icon           │
└─────────────────────────────────────────────┘
```

**Telegram Model**:
- Global enable/disable
- Per-notification-type settings
- Per-chat settings override global
- Custom notification sounds per chat
- Reaction notifications separate

**Messenger Model**:
- Per-conversation mute options
- "On" / "Important only" / "Off"
- Mute duration: 15 min, 1 hour, 8 hours, 24 hours, until unmuted

**TMA Recommendation**:
- Global: All/Mentions/Off + Do Not Disturb
- Per-conversation: Default/Mute (with duration)
- Per-notification-type: Messages, Calls, Group Updates (toggles)

### 3.2 Per-Conversation Settings (Conversation-Level)

**Mute Options** (Telegram/Messenger Pattern):

```
Conversation Settings:
├─ Notifications
│  ├─ ☑ Default (use global settings)
│  ├─ ○ Mute until: [8:00 AM tomorrow ▼]
│  ├─ ○ Mute for: [1 hour ▼]
│  └─ ○ Off (never notify)
│
├─ Sound
│  ├─ ○ Default system sound
│  └─ ○ None (silent)
│
└─ Badge Count
   ├─ ☑ Include in badge
   └─ ○ Hide from badge
```

**Smart Defaults**:
- New conversations: Inherit global settings
- Direct messages: Notify by default (unless muted)
- Groups: Notify only mentions by default
- Muted conversations: Still display badge/indicator, but no sound/vibration

### 3.3 Do Not Disturb (DND) Implementation

**Telegram Model**: Can set quiet hours globally; also per-chat override.

**Messenger Model**: Can mute for 24 hours, 8 hours, 1 hour, 15 min, or until unmuted.

**TMA Implementation** (Simple + Effective):

```python
# Backend: Check if notification should be suppressed
def should_notify_user(user_id, conversation_id, notification_type):
    # 1. Check conversation-specific mute
    conv_pref = get_conversation_preference(user_id, conversation_id)
    if conv_pref.is_muted():
        if conv_pref.mute_until < now():
            unmute_conversation(user_id, conversation_id)
        else:
            return False  # Still muted
    
    # 2. Check global DND
    global_pref = get_global_preferences(user_id)
    if global_pref.dnd_enabled and global_pref.is_in_dnd_window():
        # Still notify if priority 1 (call) or directly mentioned
        if notification_type not in ['incoming_call', 'mention']:
            return False
    
    # 3. Check notification type enabled
    if not global_pref.notify_type(notification_type):
        return False
    
    return True
```

---

## 4. Database Schema (Notification Preferences)

### 4.1 Global Notification Settings

```sql
-- User global notification preferences
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    
    -- Global toggles
    enabled_all BOOLEAN DEFAULT true,
    notify_messages BOOLEAN DEFAULT true,
    notify_mentions BOOLEAN DEFAULT true,
    notify_calls BOOLEAN DEFAULT true,
    notify_group_updates BOOLEAN DEFAULT true,
    
    -- Do Not Disturb
    dnd_enabled BOOLEAN DEFAULT false,
    dnd_start_time TIME,  -- e.g., "22:00:00"
    dnd_end_time TIME,    -- e.g., "08:00:00"
    dnd_custom_until TIMESTAMP,  -- Explicit mute until time
    
    -- Sound & Vibration
    sound_enabled BOOLEAN DEFAULT true,
    vibration_enabled BOOLEAN DEFAULT true,
    
    -- Badge count
    show_badge BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index on user_id for fast lookups
CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);
```

### 4.2 Per-Conversation Notification Settings

```sql
-- Per-conversation notification settings
CREATE TABLE conversation_notification_settings (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    
    -- Mute settings
    mute_status ENUM('default', 'muted', 'off') DEFAULT 'default',
    muted_until TIMESTAMP,  -- NULL if not muted, timestamp if muted with end time
    
    -- Sound override
    sound_status ENUM('default', 'enabled', 'disabled') DEFAULT 'default',
    
    -- Badge inclusion
    include_in_badge BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    
    UNIQUE(user_id, conversation_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Create indexes for fast lookups
CREATE INDEX idx_conv_notif_user ON conversation_notification_settings(user_id);
CREATE INDEX idx_conv_notif_conversation ON conversation_notification_settings(conversation_id);
```

### 4.3 Device Push Subscriptions (Optional - Phase 2)

```sql
-- Device push notification subscriptions
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    
    -- Device info
    device_id VARCHAR(255) NOT NULL,  -- Firebase Instance ID or APNs token
    device_platform ENUM('android', 'ios', 'web') NOT NULL,
    device_name VARCHAR(255),  -- e.g., "John's iPhone"
    
    -- Subscription data
    subscription_token TEXT NOT NULL,  -- FCM token or APNs token
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    app_version VARCHAR(50),
    os_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    last_used_at TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, device_id, device_platform)
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subs_token ON push_subscriptions(subscription_token);
```

---

## 5. Notification Payload Structure

### 5.1 Standard Notification Format

```json
{
  "id": "notif_uuid_for_dedup",
  "type": "message|mention|call|group_update",
  "priority": "high|normal|low",
  "timestamp": "2024-12-04T10:30:00Z",
  
  "user_id": "recipient_user_id",
  "conversation_id": "conv_id",
  
  "title": "John Smith",
  "body": "Hello, how are you?",
  "summary": "1 new message",
  
  "action": {
    "type": "open_conversation|answer_call|view_message",
    "target_id": "message_id|call_id"
  },
  
  "data": {
    "sender_id": "user_id",
    "sender_name": "John Smith",
    "sender_avatar": "https://...",
    "conversation_name": "Team Discussion",
    "message_preview": "Hello, how are you?",
    "mention_count": 1,
    "message_count": 3,
    "call_id": "call_uuid",
    "call_type": "voice|video"
  },
  
  "sound": "default",
  "badge": 5,
  "tag": "conv_uuid"
}
```

### 5.2 Notification Type Examples

**Type: New Message (Direct)**
```json
{
  "type": "message",
  "priority": "high",
  "title": "John Smith",
  "body": "Hey, are you free this afternoon?",
  "action": {"type": "open_conversation", "target_id": "conv_123"},
  "data": {"message_count": 1}
}
```

**Type: Mention in Group**
```json
{
  "type": "mention",
  "priority": "high",
  "title": "Project Planning - @you",
  "body": "John Smith: @Sarah can you review the proposal?",
  "action": {"type": "open_conversation", "target_id": "conv_456"},
  "data": {"mention_count": 1}
}
```

**Type: Incoming Call**
```json
{
  "type": "call",
  "priority": "high",
  "title": "John Smith",
  "body": "Incoming voice call...",
  "action": {"type": "answer_call", "target_id": "call_789"},
  "data": {"call_type": "voice", "call_id": "call_789"}
}
```

**Type: Missed Call**
```json
{
  "type": "missed_call",
  "priority": "normal",
  "title": "Missed call - John Smith",
  "body": "You missed a voice call",
  "action": {"type": "open_conversation", "target_id": "conv_123"},
  "data": {"call_type": "voice"}
}
```

**Type: Group Update**
```json
{
  "type": "group_update",
  "priority": "normal",
  "title": "Team Discussion",
  "body": "Sarah joined the group",
  "action": {"type": "open_conversation", "target_id": "conv_456"},
  "data": {"update_type": "member_joined", "member_name": "Sarah"}
}
```

---

## 6. Implementation Layers

### 6.1 Backend Implementation (FastAPI)

**Location**: `app/services/notifications.py`

**Responsibilities**:
- Generate notifications based on events
- Check user preferences (DND, mute, type enabled)
- Decide delivery channels (WebSocket, in-app, device push)
- Rate limiting to prevent spam
- Deduplication (prevent duplicate notifications)

```python
# Pseudo-code structure
class NotificationService:
    def should_notify_user(user_id, conversation_id, notif_type):
        """Check all conditions before notifying"""
        
    def create_notification(sender_id, recipient_id, notif_type, data):
        """Generate and deliver notification"""
        
    def send_via_websocket(user_id, notification):
        """Send real-time via Socket.io"""
        
    def send_in_app(user_id, notification):
        """Store in notification center"""
        
    def send_device_push(user_id, notification):
        """Queue for FCM/APNs (Phase 2)"""
```

**WebSocket Integration** (Socket.io):

```python
# In Socket.io event handlers
@sio.on('message:new')
async def handle_new_message(sid, data):
    message = create_message(data)
    
    # Notify all conversation members
    for user_id in conversation.member_ids:
        if should_notify_user(user_id, conversation_id, 'message'):
            notif = create_notification(
                type='message',
                recipient_id=user_id,
                data=message
            )
            
            # Send to connected clients
            await sio.emit('notification:new', notif, to=get_user_rooms(user_id))
```

### 6.2 Frontend Implementation (Next.js)

**Location**: `src/features/notifications/`

**Structure**:
```
src/features/notifications/
├── components/
│   ├── NotificationToast.tsx
│   ├── NotificationCenter.tsx
│   └── IncomingCallAlert.tsx
├── hooks/
│   ├── useNotifications.ts
│   ├── useNotificationPreferences.ts
│   └── useSound.ts
├── services/
│   ├── notificationService.ts
│   └── preferenceService.ts
└── types.ts
```

**Socket.io Listener Hook**:

```typescript
// useNotifications.ts
export function useNotifications() {
  const { socket } = useSocket();
  const { addNotification } = useNotificationStore();
  const { notify } = useToast();
  
  useEffect(() => {
    if (!socket) return;
    
    socket.on('notification:new', (notification) => {
      // Store in notification center
      addNotification(notification);
      
      // Show toast for high-priority
      if (notification.priority === 'high') {
        notify({
          title: notification.title,
          description: notification.body,
          variant: 'default'
        });
      }
      
      // Play sound if enabled
      playNotificationSound();
    });
    
    return () => socket.off('notification:new');
  }, [socket]);
}
```

**Notification Center Component**:

```typescript
// NotificationCenter.tsx - Single notification center for all unread notifications
// Shows aggregated view: "3 new messages from John", etc.
// Click to navigate to conversation
// Dismiss individual or clear all
```

### 6.3 Notification Preferences UI (Settings)

**Location**: `src/features/settings/components/NotificationSettings.tsx`

**Components**:
- Global notification toggles
- Do Not Disturb time picker
- Per-conversation mute options (in conversation header)
- Sound/vibration preferences

---

## 7. Security & Best Practices

### 7.1 Privacy Considerations

**Issue**: Push notification content may be visible on locked device

**Solutions** (per Telegram/Messenger):

1. **Content Truncation**
   - Don't send full message text for sensitive convos
   - Use: "You received a message" instead of full content
   - User can enable "Show Preview" in settings (default OFF)

2. **Encryption**
   - Always encrypt notifications in transit
   - Use HTTPS for all API calls
   - Web Push uses VAPID keys for encryption

3. **Authentication**
   - Validate JWT token on every notification request
   - Verify user owns the target conversation
   - Never include sensitive data unencrypted

```python
# Backend validation example
def send_notification(user_id, notification):
    # Verify user can receive this notification
    if not user_can_access_conversation(user_id, notification.conversation_id):
        raise PermissionError("Cannot notify about this conversation")
    
    # Sanitize content if user preference set
    if not get_user_preference(user_id).show_preview:
        notification.body = "You have a new message"
```

### 7.2 Rate Limiting & Spam Prevention

**Telegram Model**: Rate limits push notifications to prevent device battery drain.

**Firebase Model**: Throttles similar notifications, suggests batching.

**TMA Implementation**:

```python
# Rate limiting rules
RATE_LIMITS = {
    'messages_per_minute': 10,  # Max 10 notifications per minute per user
    'same_sender_burst': 3,      # Max 3 notifications from same sender in 5 min
    'group_notifications': 5,    # Max 5 group notifications per minute
}

# Batching logic
def should_batch_notification(user_id, notification_type):
    """
    Combine similar notifications if sent within 5 seconds
    E.g., "John sent 3 messages" instead of 3 separate notifications
    """
    recent_notifs = get_recent_notifications(user_id, seconds=5)
    if len(recent_notifs) > 3:
        return True
    return False
```

### 7.3 Deduplication

**Issue**: Network retry or multiple event handlers can create duplicate notifications.

**Solution** (per Telegram):

```python
# Use unique notification IDs
notification_id = f"{event_type}_{timestamp}_{user_id}_{data_hash}"

# Check if already sent
if notification_exists(notification_id):
    return  # Skip duplicate

# Send and mark as sent
send_notification(notification)
store_notification_id(notification_id)
```

---

## 8. Implementation Roadmap (Phases)

### Phase 1: In-App Notifications (Week 1-2) ← START HERE
**Simplest, highest ROI**

- Database schema (preferences + settings)
- Global notification preferences UI
- Per-conversation mute in conversation header
- WebSocket event listeners (useNotifications hook)
- Toast notification component
- Notification badge count on conversation
- Do Not Disturb time picker
- In-app notification center
- Sound toggle + play sound on notification

**Deliverables**:
- Working notification preferences
- Real-time notification delivery via WebSocket
- Mute/unmute conversations
- Toast notifications on new messages

### Phase 2: Browser Push Notifications (Week 3) ← OPTIONAL
**For web-only users who want notifications when tab closed**

- Service Worker setup
- VAPID key generation
- Push subscription management
- Send notifications to service worker
- Service worker notification display
- Notification click handling

**Why optional**: For TMA, WebSocket handles most cases since most users keep app open.

### Phase 3: Device Push Notifications (Week 4+) ← FUTURE
**For mobile app**

- Firebase Cloud Messaging (FCM) setup
- Apple Push Notification (APNs) setup
- Device token registration
- Push notification sending
- Notification handling on app close
- Call notifications (high-priority)

---

## 9. Essential vs. Nice-to-Have Features

### Essential (MVP - Must Have)
- ☑ Global notification on/off toggle
- ☑ Per-conversation mute with duration
- ☑ Do Not Disturb with time range
- ☑ WebSocket-based real-time delivery
- ☑ Toast notifications on new messages
- ☑ Badge count per conversation
- ☑ Sound toggle on/off
- ☑ Notification preferences in settings
- ☑ Mute/unmute button in conversation header
- ☑ Notification center (history view)

### Nice-to-Have (Post-MVP)
- Custom notification sounds per conversation
- Vibration patterns (mobile)
- Notification grouping/batching UI
- Rich notification content (images, buttons)
- Scheduled Do Not Disturb
- Browser push notifications (web)
- Device push notifications (mobile)
- Notification templates/presets
- Smart notification aggregation (AI)
- Read receipts for notifications

---

## 10. Testing Strategy

### Backend Tests

```python
# tests/services/test_notification_service.py

def test_should_not_notify_when_disabled():
    user = create_test_user()
    set_notification_preference(user.id, enabled_all=False)
    
    result = should_notify_user(user.id, conv_id, 'message')
    assert result is False


def test_should_not_notify_during_dnd():
    user = create_test_user()
    set_dnd_window(user.id, start='22:00', end='08:00')
    mock_current_time('23:00')
    
    result = should_notify_user(user.id, conv_id, 'message')
    assert result is False


def test_should_notify_calls_during_dnd():
    user = create_test_user()
    set_dnd_window(user.id, start='22:00', end='08:00')
    mock_current_time('23:00')
    
    result = should_notify_user(user.id, conv_id, 'call')
    assert result is True  # Calls bypass DND


def test_should_not_notify_muted_conversation():
    user = create_test_user()
    mute_conversation(user.id, conv_id, minutes=60)
    
    result = should_notify_user(user.id, conv_id, 'message')
    assert result is False
```

### Frontend Tests

```typescript
// src/__tests__/features/notifications/useNotifications.test.ts

describe('useNotifications', () => {
  it('should add notification to store', () => {
    const { result } = renderHook(() => useNotifications());
    const mockNotification = {
      id: '1',
      type: 'message',
      priority: 'high',
      title: 'Test',
      body: 'Test message',
    };
    
    // Simulate socket event
    act(() => {
      result.current.onNotification(mockNotification);
    });
    
    expect(result.current.notifications).toContainEqual(mockNotification);
  });
  
  it('should play sound for high priority', () => {
    const playSpy = jest.spyOn(Audio.prototype, 'play');
    
    renderHook(() => useNotifications());
    
    // Trigger high-priority notification
    // Assert sound played
    expect(playSpy).toHaveBeenCalled();
  });
});
```

---

## 11. Migration & Rollout Plan

### Phase 1: Internal Testing (1 week)
- Deploy notification system to staging
- Test all notification scenarios
- Test preference management
- Load test notification delivery

### Phase 2: Beta Rollout (1 week)
- Enable for beta testers
- Gather feedback on notification behavior
- Monitor for issues
- Adjust settings (rate limits, batching)

### Phase 3: Full Rollout (1 week)
- Enable for all users
- Monitor delivery rates
- Track user adoption of preference settings
- Gather feedback for improvements

---

## 12. Monitoring & Metrics

### Key Metrics to Track

```
// Notification Delivery
- notifications_sent_total (counter)
- notifications_delivered (counter, only if acked)
- notification_delivery_latency (histogram)
- notifications_failed (counter)

// User Engagement
- notifications_opened (counter)
- notifications_dismissed (counter)
- notification_click_through_rate (gauge)

// Preferences
- users_with_dnd_enabled (gauge)
- users_with_notifications_disabled (gauge)
- muted_conversations_count (gauge)

// Performance
- notification_processing_time (histogram)
- websocket_queue_depth (gauge)
```

### Alerts to Set Up

- Notification delivery latency > 5 seconds
- Failed notifications > 1% of total sent
- WebSocket disconnections spike
- DND/mute preference lookup errors

---

## 13. Final Recommendations

### Start Simple, Iterate Later

**Phase 1 MVP** (Week 1-2):
1. WebSocket-based real-time delivery
2. Global enable/disable toggle
3. Per-conversation mute with duration
4. Do Not Disturb time range
5. Sound toggle
6. Toast notifications
7. Notification badge count

**Don't Implement Yet**:
- Device push notifications (Phase 3)
- Browser push notifications (Phase 2)
- Rich notifications (Phase 2)
- Notification history persistence (Phase 2)
- Notification analytics (Phase 2)

### Architecture Principles

1. **Keep it Simple**: Real-time WebSocket handles 90% of use cases
2. **Privacy First**: Never show message content by default
3. **User Control**: All notifications must be configurable
4. **Accessibility**: Ensure DND doesn't break critical calls
5. **Scalable**: Rate limiting prevents spam and resource exhaustion
6. **Testable**: Separate notification logic from delivery

### Success Criteria

- Users can mute/unmute conversations in < 2 seconds
- All new messages notify within 500ms
- DND actually silences notifications
- Notification preferences UI is intuitive
- Zero duplicate notifications
- No missed calls due to notification issues

---

## Quick Reference: Telegram vs Messenger vs FCM Patterns

| Feature | Telegram | Messenger | Firebase | TMA |
|---------|----------|-----------|----------|-----|
| **Real-time Delivery** | MTProto API | WebSocket | FCM | WebSocket |
| **Offline Delivery** | Push (APNs/FCM) | Push (APNs/FCM) | FCM | Phase 2 |
| **Notification Types** | Many (15+) | Few (main 3) | 2 (data/notif) | 5 (message, mention, call, update, missed) |
| **Per-Chat Mute** | Yes (custom sounds) | Yes (duration-based) | N/A | Yes (duration-based) |
| **Global DND** | Yes (hourly range) | Basic silence | N/A | Yes (hourly range) |
| **Notification Grouping** | Yes (smart) | Yes (thread-based) | No (manual) | Phase 2 |
| **Sound Control** | Per-chat | Per-chat | N/A | Global + toggle |
| **Vibration** | Per-chat | Per-chat | N/A | Global + toggle |
| **Badge Count** | Yes | Yes | Yes | Yes |
| **Content Encryption** | Yes | Yes | Yes | Yes (TLS) |
| **Rate Limiting** | Yes | Yes | Yes | Phase 1 |

---

**Document Version**: 1.0
**Created**: 2024-12-04
**Status**: Ready for Implementation (Phase 1)
