# WebSocket Configuration Guide

## Date: 2025-10-16

## Overview

This document explains the WebSocket configuration for the TMS Client application, specifically for Railway deployment.

## Configuration Summary

### Connection Details

- **Server URL**: `wss://tms-server-staging.up.railway.app` (Railway) or `ws://localhost:8000` (local)
- **Path**: `/ws/socket.io`
- **Full Endpoint**: `wss://tms-server-staging.up.railway.app/ws/socket.io/`
- **Transport**: WebSocket only (no polling)

## File Structure

### 1. Constants (`/src/lib/constants.ts`)

**Purpose**: Provides runtime WebSocket URL detection

**Key Function**: `getWsUrl()`
```typescript
const getWsUrl = () => {
  // Detects environment from window.location.hostname
  // Returns correct wss:// or ws:// URL
}
```

**Features**:
- Runtime detection (not build-time)
- Automatic `wss://` for Railway deployments
- Automatic `ws://` for localhost
- Environment variable fallback

### 2. Socket Client (`/src/lib/socket.ts`)

**Purpose**: Singleton Socket.IO client for app-wide usage

**Configuration**:
```typescript
io(SOCKET_URL, {
  path: '/ws/socket.io',      // Server mount point + socketio_path
  auth: { token },            // JWT token for authentication
  transports: ['websocket'],  // WebSocket-only (no polling)
  upgrade: false,             // Direct WebSocket (no upgrade from polling)
  reconnection: true,         // Auto-reconnect on disconnect
  reconnectionDelay: 1000,    // Start with 1s delay
  reconnectionDelayMax: 5000, // Max 5s between attempts
  reconnectionAttempts: 5,    // Try 5 times before giving up
  timeout: 20000,             // 20s connection timeout (Railway needs this)
  autoConnect: true,          // Connect immediately
  forceNew: false,            // Reuse existing connection if available
});
```

### 3. WebSocket Service (`/src/features/chat/services/websocketService.ts`)

**Purpose**: Feature-specific WebSocket service for messaging

**Same configuration as Socket Client**, but with additional logging:
```typescript
console.log('[WebSocket] Connecting to:', WS_URL);
console.log('[WebSocket] Path: /ws/socket.io');
console.log('[WebSocket] Full URL:', `${WS_URL}/ws/socket.io/`);
```

## Environment Detection

### Railway Deployment
```typescript
if (hostname.includes('railway.app')) {
  return 'wss://tms-server-staging.up.railway.app';
}
```

### Local Development
```typescript
if (hostname === 'localhost' || hostname === '127.0.0.1') {
  return 'ws://localhost:8000';
}
```

### Environment Variable Fallback
```typescript
const envUrl = process.env.NEXT_PUBLIC_WS_URL;
if (envUrl) {
  // Force wss:// for Railway domains
  if (envUrl.includes('railway.app') && envUrl.startsWith('ws://')) {
    return envUrl.replace('ws://', 'wss://');
  }
  return envUrl;
}
```

## Key Configuration Rules

### 1. Path Must Match Server

**Server Configuration**:
- Mount point: `/ws` (in `main.py`)
- Socket.IO path: `socket.io` (in `websocket.py`)
- Final endpoint: `/ws/socket.io/`

**Client Configuration**:
- Path: `/ws/socket.io` (Socket.IO appends `/`)

### 2. Transport: WebSocket Only

Railway deployments require WebSocket-only mode:
```typescript
transports: ['websocket']  // NOT ['polling', 'websocket']
upgrade: false             // NOT true
```

### 3. Increased Timeout for Railway

Railway needs longer connection timeout:
```typescript
timeout: 20000  // 20 seconds (NOT default 10000)
```

## Connection Flow

### 1. Client Initialization
```typescript
import { socketClient } from '@/lib/socket';

// In component or hook
const token = authService.getStoredToken();
const socket = socketClient.connect(token);
```

### 2. Connection Events
```typescript
socket.on('connect', () => {
  console.log('[Socket] Connected to server');
});

socket.on('disconnect', (reason) => {
  console.log('[Socket] Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('[Socket] Connection error:', error);
});
```

### 3. Join Conversation
```typescript
socketClient.joinConversation(conversationId);

// Listen for confirmation
socket.once('joined_conversation', (data) => {
  console.log('Joined conversation:', data.conversation_id);
});
```

### 4. Listen for Messages
```typescript
socketClient.onNewMessage((message) => {
  console.log('New message:', message);
  // Update UI with new message
});
```

## Debugging WebSocket Connections

### 1. Browser DevTools Console

Look for these logs:
```
[WebSocket] Connecting to: wss://tms-server-staging.up.railway.app
[WebSocket] Path: /ws/socket.io
[WebSocket] Full URL: wss://tms-server-staging.up.railway.app/ws/socket.io/
✅ WebSocket connected: <socket-id>
```

### 2. Network Tab

Filter by `WS` to see WebSocket connections:
- **Status**: `101 Switching Protocols` (success)
- **Type**: `websocket`
- **URL**: `wss://tms-server-staging.up.railway.app/ws/socket.io/?EIO=4&transport=websocket&...`

### 3. Common Error Messages

**"websocket error"**
- Check server is running: `curl https://tms-server-staging.up.railway.app/health`
- Check WebSocket config: `curl https://tms-server-staging.up.railway.app/health/websocket`
- Verify CORS in server config

**"timeout"**
- Increase `timeout` in client config
- Check Railway service is not sleeping
- Verify network allows WebSocket connections

**"unauthorized"**
- Check auth token is valid: `localStorage.getItem('auth_token')`
- Verify token is sent in `auth` object
- Check server logs for auth errors

## Environment Variables (Optional)

These are **OPTIONAL** - the client auto-detects environment:

```bash
# .env.local (for local development overrides)
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_ENVIRONMENT=development
```

```bash
# Railway environment variables (auto-detected, but can override)
NEXT_PUBLIC_WS_URL=wss://tms-server-staging.up.railway.app
NEXT_PUBLIC_API_URL=https://tms-server-staging.up.railway.app/api/v1
NEXT_PUBLIC_ENVIRONMENT=staging
```

## Testing WebSocket Connection

### Manual Test in Browser Console

```javascript
// 1. Get auth token
const token = localStorage.getItem('auth_token');

// 2. Create test connection
const testSocket = io('wss://tms-server-staging.up.railway.app', {
  path: '/ws/socket.io',
  auth: { token },
  transports: ['websocket'],
  upgrade: false,
});

// 3. Listen for events
testSocket.on('connect', () => console.log('✅ Connected'));
testSocket.on('connect_error', (err) => console.error('❌ Error:', err));
testSocket.on('disconnect', (reason) => console.log('Disconnected:', reason));

// 4. Test joining conversation
testSocket.emit('join_conversation', { conversation_id: '<conv-id>' });
testSocket.on('joined_conversation', (data) => console.log('Joined:', data));

// 5. Clean up
testSocket.disconnect();
```

## Reconnection Behavior

### Automatic Reconnection

Socket.IO automatically reconnects with exponential backoff:
1. **First attempt**: 1s delay
2. **Second attempt**: 1s delay
3. **Third attempt**: 2s delay
4. **Fourth attempt**: 4s delay
5. **Fifth attempt**: 5s delay (max)

After 5 failed attempts, connection is abandoned.

### Manual Reconnection

```typescript
// Check connection status
if (!socketClient.isConnected()) {
  // Reconnect with fresh token
  const token = authService.getStoredToken();
  socketClient.disconnect();  // Clean up old connection
  socketClient.connect(token); // Create new connection
}
```

## Best Practices

### 1. Connect Once per Session

```typescript
// ✅ Good: Connect once when user logs in
useEffect(() => {
  const token = authService.getStoredToken();
  if (token && !socketClient.isConnected()) {
    socketClient.connect(token);
  }
}, []);

// ❌ Bad: Connect on every render
const socket = socketClient.connect(token); // Creates new connection each render
```

### 2. Clean Up Event Listeners

```typescript
useEffect(() => {
  const handleNewMessage = (message) => {
    console.log('New message:', message);
  };

  socketClient.onNewMessage(handleNewMessage);

  // Clean up on unmount
  return () => {
    socketClient.off('new_message', handleNewMessage);
  };
}, []);
```

### 3. Handle Disconnections Gracefully

```typescript
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server forcefully disconnected - show error to user
    toast.error('Connection lost. Please refresh the page.');
  } else if (reason === 'transport close') {
    // Network issue - will auto-reconnect
    toast.info('Reconnecting...');
  }
});
```

## Troubleshooting Checklist

- [ ] Check server is running: `GET https://tms-server-staging.up.railway.app/health`
- [ ] Check WebSocket config: `GET https://tms-server-staging.up.railway.app/health/websocket`
- [ ] Verify auth token exists: `localStorage.getItem('auth_token')`
- [ ] Check browser console for connection logs
- [ ] Check Network tab for WebSocket (WS) connections
- [ ] Verify CORS allows your client domain
- [ ] Confirm Railway service is not sleeping
- [ ] Test with WebSocket echo service to rule out client issues

## Next Steps

1. Test WebSocket connection after deployment
2. Monitor reconnection behavior under network disruptions
3. Load test with multiple concurrent connections
4. Implement offline message queue for disconnections

## References

- Socket.IO Client API: https://socket.io/docs/v4/client-api/
- Socket.IO Client Options: https://socket.io/docs/v4/client-options/
- Railway Docs: https://docs.railway.app/
