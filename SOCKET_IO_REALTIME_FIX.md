# TMS Chat - Socket.IO Real-Time Fix (Client)

## Problem

Messages were not appearing in real-time. Users had to refresh the page to see new messages they sent or received.

## Root Cause

**Socket.IO Path Mismatch:**
- Client was connecting to: `/ws/socket.io` ❌
- Server was listening on: `/socket.io` ✅

This caused Socket.IO connection to fail silently, falling back to polling or failing entirely.

## Fix Applied

### Files Changed

1. `src/features/chat/services/websocketService.ts`
2. `src/lib/socket.ts`

### Changes

```typescript
// BEFORE (WRONG):
this.socket = io(WS_URL, {
  path: '/ws/socket.io',  // ❌ Wrong path
  auth: { token },
  transports: ['websocket'],
  // ...
});

// AFTER (CORRECT):
this.socket = io(WS_URL, {
  path: '/socket.io',  // ✅ Correct path
  auth: { token },
  transports: ['websocket'],
  // ...
});
```

## Why This Fix Works

The TMS-Server uses python-socketio's `ASGIApp` wrapper:

```python
# Server configuration (tms-server/app/main.py)
app = connection_manager.get_asgi_app(fastapi_app)

# Which does:
socketio.ASGIApp(sio, fastapi_app)
```

This makes Socket.IO handle all `/socket.io/*` endpoints directly. The client **must** connect to the same path.

## Deployment

### 1. Commit Changes

```bash
cd /Users/kyleisaacmendoza/Documents/workspace/tms-client

# Stage the fixed files
git add src/features/chat/services/websocketService.ts
git add src/lib/socket.ts

# Commit
git commit -m "fix: Socket.IO path configuration to match server"

# Push to Railway
git push origin staging  # or main
```

### 2. Verify Environment Variables

Go to **Railway Dashboard** → **tms-client-staging** → **Variables**

Ensure these are set:
```bash
NEXT_PUBLIC_API_URL=https://tms-server-staging.up.railway.app/api/v1
NEXT_PUBLIC_WS_URL=https://tms-server-staging.up.railway.app
NEXTAUTH_URL=https://tms-client-staging.up.railway.app
NEXTAUTH_SECRET=<same-as-gcgc-and-tms-server>
```

### 3. Deploy and Test

After Railway finishes deploying:

1. Open https://tms-client-staging.up.railway.app
2. Open Browser DevTools → Console
3. Look for:
   ```
   [WebSocket] Connecting to: https://tms-server-staging.up.railway.app
   [WebSocket] Path: /socket.io
   [WebSocket] Full URL: https://tms-server-staging.up.railway.app/socket.io/
   ✅ WebSocket connected: <socket-id>
   ```

4. Send a message
5. **Expected:** Message appears immediately without refresh

## Testing Checklist

- [ ] Socket.IO connection established (check console)
- [ ] No connection errors in console
- [ ] Messages appear instantly when sent
- [ ] Other users see messages in real-time
- [ ] No need to refresh to see new messages
- [ ] Typing indicators work
- [ ] User presence (online/offline) updates

## How Real-Time Works Now

### 1. Initial Connection

```typescript
// When user logs in and views chat
wsService.connect();  // Establishes Socket.IO connection
```

### 2. Join Conversation

```typescript
// When user opens a conversation
wsService.joinConversation(conversationId);

// Server adds user to Socket.IO room
// Room name: `conversation:${conversationId}`
```

### 3. Send Message

```typescript
// User sends message via REST API
const message = await messageService.sendMessage({
  conversation_id: conversationId,
  content: "Hello!",
  type: "text"
});
```

### 4. Real-Time Broadcast

```python
# Server (after saving message to DB)
await ws_manager.broadcast_new_message(
    conversation_id,
    enriched_message
)
```

### 5. Receive Message

```typescript
// All users in conversation room receive
wsService.onNewMessage((message) => {
  // Update UI immediately
  addMessageToChat(message);
});
```

## Architecture

```
User Types Message
       │
       ▼
  [Input Box] ─────► Send via HTTP POST /api/v1/messages/
                            │
                            ▼
                     Server saves to DB
                            │
                            ▼
                     Socket.IO broadcasts
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
  [You see it]      [Other User 1]       [Other User 2]
  (immediately)     (real-time)          (real-time)
```

## Socket.IO Events

### Outgoing (Client → Server)

- `connect` - Authenticate with JWT token
- `join_conversation` - Join a conversation room
- `leave_conversation` - Leave a conversation room
- `typing_start` - User started typing
- `typing_stop` - User stopped typing

### Incoming (Server → Client)

- `connect` - Connection established
- `disconnect` - Connection lost
- `new_message` - New message in conversation
- `message_edited` - Message was edited
- `message_deleted` - Message was deleted
- `message_status` - Message status (delivered/read)
- `user_typing` - Someone is typing
- `user_online` - User came online
- `user_offline` - User went offline
- `reaction_added` - Reaction added to message
- `reaction_removed` - Reaction removed from message

## Debugging

### Check Socket.IO Connection

Open Browser Console and look for:

```javascript
// Good connection:
[WebSocket] Connecting to: https://tms-server-staging.up.railway.app
[WebSocket] Path: /socket.io
✅ WebSocket connected: abc123xyz

// Bad connection:
[WebSocket] Connection error: ...
❌ WebSocket disconnected: ...
```

### Enable Socket.IO Debug Mode

Add to your `.env.local`:
```bash
NEXT_PUBLIC_DEBUG_SOCKET=true
```

Then in console:
```javascript
localStorage.setItem('debug', 'socket.io-client:*');
```

Refresh page to see detailed Socket.IO logs.

### Common Issues

#### 1. Socket.IO Not Connecting

**Symptom:** No connection logs in console

**Check:**
- `NEXT_PUBLIC_WS_URL` is correct
- Server is running (curl health endpoint)
- Token is valid (check auth)

#### 2. Connection Drops Frequently

**Symptom:** Constant reconnection attempts

**Check:**
- Railway free tier limits
- Server WebSocket timeout settings
- Network stability

#### 3. Messages Not Received

**Symptom:** Socket.IO connected but no messages

**Check:**
- You joined the conversation room (check console)
- Server broadcasting correctly (check server logs)
- Event listener is registered

## Success Criteria

✅ **Working when:**
- Socket.IO connects on login
- Messages appear instantly (no refresh)
- Both sender and receiver see messages immediately
- Typing indicators work
- User presence updates
- No connection errors in console

---

**Status:** ✅ **FIXED AND READY TO DEPLOY**

**Related:** See `tms-server/SOCKET_IO_REALTIME_FIX.md` for server-side changes

