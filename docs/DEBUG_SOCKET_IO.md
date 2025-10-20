# 🔍 Socket.IO Real-Time Debug Guide

## Issue
Messages still require a page refresh to appear. Socket.IO is not delivering real-time updates.

---

## 🧪 Step-by-Step Debugging

### **Step 1: Check if Socket.IO is Connected**

Open your browser console (F12) and check for these logs when you open the chat page:

✅ **Expected logs:**
```
[Socket] Initializing WebSocket connection...
[Socket] Token preview (first 30 chars): eyJhbGciOiJIUzI1NiIsInR5cCI6...
[Socket] Token length: 200+
[SocketClient] Connecting to: https://tms-server-staging.up.railway.app
[Socket] WebSocket connected successfully
```

❌ **If you see:**
```
[Socket] No auth token found - cannot connect
```
**Problem:** Auth token is missing. Check your login flow.

❌ **If you see:**
```
[Socket] Connection error: ...
```
**Problem:** Cannot connect to server. Check CORS/network issues.

---

### **Step 2: Check if Room is Joined**

After opening a conversation, you should see:

✅ **Expected logs:**
```
[useMessages] Fetching messages for conversation: abc123...
[useMessages] Joining conversation room: abc123...
[Socket] Joining conversation: abc123...
[Socket] ✅ Successfully joined conversation: abc123...
```

❌ **If you DON'T see** `Successfully joined conversation`:
**Problem:** Room join failed. Check server logs.

---

### **Step 3: Check Server Logs (Railway)**

When you **open a conversation**, Railway logs should show:

✅ **Expected:**
```
[join_conversation] SID: <socket-id>
[join_conversation] Parsed conversation_id: abc123...
[join_conversation] User ID from connection: user-id
[join_conversation] ConversationMember found: True
[join_conversation] Joining Socket.IO room: conversation:abc123...
[join_conversation] SUCCESS: User joined conversation abc123...
[join_conversation] Active rooms for conversation: 1 members
```

❌ **If you see:**
```
[join_conversation] User not authenticated
```
**Problem:** JWT token is invalid or not being sent.

❌ **If you see:**
```
[join_conversation] User not a member of conversation
```
**Problem:** Database issue - user is not in conversation_members table.

---

### **Step 4: Send a Message and Check Broadcast**

When you **send a message**, check **BOTH** browser console AND Railway logs:

#### **Browser Console:**

✅ **Expected:**
```
[useMessages] New message received via WebSocket: {id: "...", content: "Test", ...}
[ChatPage] Messages updated: [... new message array ...]
```

❌ **If you DON'T see** `New message received via WebSocket`:
**Problem:** Client is not receiving the Socket.IO broadcast!

#### **Railway Logs:**

✅ **Expected:**
```
[broadcast_new_message] Broadcasting to room: conversation:abc123...
[broadcast_new_message] Active members in room: 1
[broadcast_new_message] Message ID: msg-id
[broadcast_new_message] Sender ID: sender-id
[broadcast_new_message] Message broadcasted successfully
```

❌ **If you see:**
```
[broadcast_new_message] Active members in room: 0
```
**Problem:** No one is in the room! Client didn't join or left early.

---

### **Step 5: Check Event Listeners**

Open browser console and type:

```javascript
// Check if socket is connected
window.socketClient = require('@/lib/socket').socketClient;
socketClient.isConnected();  // Should return: true

// Check socket instance
socketClient.getSocket();  // Should return: Socket object

// Manually listen for new_message
socketClient.getSocket().on('new_message', (msg) => {
  console.log('🔥 MANUAL TEST - Received new_message:', msg);
});
```

Now send a message and see if you get: `🔥 MANUAL TEST - Received new_message:`

✅ **If YES:** Event is being received but `useMessages` handler has an issue
❌ **If NO:** Socket.IO broadcast is not working

---

## 🐛 Common Issues & Fixes

### **Issue 1: Token Not Being Sent**

**Symptom:** Server logs show `User not authenticated`

**Fix:** Check if token is being sent in Socket.IO auth:

```typescript
// In src/lib/socket.ts (should already be correct)
this.socket = io(SOCKET_URL, {
  path: '/socket.io',
  auth: {
    token,  // ← Must be present
  },
  transports: ['websocket'],
});
```

---

### **Issue 2: Client Disconnects Immediately**

**Symptom:** Logs show `Connected` then immediately `Disconnected`

**Fix:** Check `useSocket` hook cleanup - might be disconnecting too early:

```typescript
// In src/hooks/useSocket.ts
useEffect(() => {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  const socket = socketClient.connect(token);
  
  // Don't disconnect on cleanup! Keep connection alive
  return () => {
    // Remove this line: socketClient.disconnect();
    console.log('[Socket] Component unmounted but keeping connection alive');
  };
}, []);
```

---

### **Issue 3: Multiple Socket Connections**

**Symptom:** Multiple "Connected" logs, then connection drops

**Fix:** Ensure socket is a singleton. Check `socketClient` initialization:

```typescript
// src/lib/socket.ts
class SocketClient {
  private socket: Socket | null = null;  // ← Only one instance
  
  connect(token: string): Socket {
    // Prevent multiple connections
    if (this.socket?.connected) {
      console.log('[SocketClient] Already connected, reusing socket');
      return this.socket;
    }
    
    // ... rest of connection code
  }
}

// Export singleton
export const socketClient = new SocketClient();  // ← One instance only
```

---

### **Issue 4: Room Join Happens Before Connection**

**Symptom:** `Joining conversation room` log but no `Successfully joined`

**Fix:** Wait for connection in `useMessages` hook (should already be correct):

```typescript
// In useMessages.ts
const joinRoom = () => {
  if (socketClient.isConnected()) {
    socketClient.joinConversation(conversationId);
  } else {
    console.log('[useMessages] Waiting for connection...');
  }
};

// Try immediately
joinRoom();

// Also listen for connection
socket.on('connect', joinRoom);
```

---

### **Issue 5: Event Handler Not Registered**

**Symptom:** Server broadcasts but client never receives

**Check:** Ensure `onNewMessage` is called:

```typescript
// useMessages.ts (line 148)
socketClient.onNewMessage(handleNewMessage);  // ← Must be called

// And socketClient.onNewMessage should do:
onNewMessage(callback: (message: Record<string, unknown>) => void) {
  this.socket?.on('new_message', callback);  // ← Subscribes to event
}
```

---

## 🎯 Quick Diagnostic Commands

Run these in **browser console** to quickly diagnose:

```javascript
// 1. Check connection status
console.log('Connected:', window.socketClient?.isConnected());

// 2. Check socket instance
console.log('Socket:', window.socketClient?.getSocket());

// 3. Get active listeners
console.log('Listeners:', window.socketClient?.getSocket()?._callbacks);

// 4. Manually join room
window.socketClient?.joinConversation('YOUR_CONVERSATION_ID');

// 5. Listen for ANY Socket.IO event
window.socketClient?.getSocket()?.onAny((event, ...args) => {
  console.log(`🔥 Event: ${event}`, args);
});

// 6. Send test message
window.socketClient?.getSocket()?.emit('test_event', { message: 'hello' });
```

---

## 📊 Expected vs Actual Flow

### **✅ Expected Flow:**

1. User opens chat page → `useSocket` initializes connection
2. Socket connects → `[Socket] WebSocket connected successfully`
3. `useMessages` hook mounts → Joins conversation room
4. Server confirms → `[Socket] ✅ Successfully joined conversation`
5. User sends message → HTTP POST to `/api/v1/messages/`
6. Server saves message → Returns 201
7. **Server broadcasts via Socket.IO** → Emits `new_message` to room
8. **Client receives broadcast** → `[useMessages] New message received`
9. **State updates** → `setMessages((prev) => [...prev, newMessage])`
10. **UI updates instantly** → Message appears!

### **❌ What's Happening Now (likely):**

1-5. ✅ Same as above
6. ❌ **Broadcast not reaching client** OR **Client not listening**
7. ❌ User has to refresh → HTTP GET fetches messages

---

## 🔧 Action Items

Based on your debugging results, please provide:

1. **Browser console logs** when opening a conversation
2. **Railway server logs** when sending a message
3. **Result of Step 5** (manual event listener test)
4. **Any error messages** in console or Railway

This will help me identify the exact issue! 🚀

