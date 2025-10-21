# User Sync Architecture

## Overview

**All users in the TMS (Team Messaging App) come from the GCGC Team Management System.**

The TMS app does NOT have its own user management - it's a **read-only client** of the Team Management System's user data.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  GCGC Team Management System (SOURCE OF TRUTH)                   │
│  https://gcgc-team-management-system-staging.up.railway.app      │
│                                                                   │
│  - User authentication (NextAuth)                                │
│  - User profiles and management                                  │
│  - Organizational hierarchy                                      │
│  - Role/permission management                                    │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 │ API Calls (HTTPS)
                 │ - /api/v1/users/me (get current user)
                 │ - /api/v1/users/search (search all users)
                 │ - /api/v1/users/{id} (get specific user)
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  TMS Client (Frontend)                                           │
│  https://tms-client-staging.up.railway.app                       │
│                                                                   │
│  - Displays users from Team Management System                    │
│  - Manages conversations and messages                            │
│  - Real-time WebSocket messaging                                 │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 │ API Calls (HTTPS)
                 │ - /api/v1/conversations (create/manage chats)
                 │ - /api/v1/messages (send/receive messages)
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  TMS Server (Backend - FastAPI)                                  │
│  https://tms-server-staging.up.railway.app                       │
│                                                                   │
│  - Stores conversations and messages                             │
│  - WebSocket server for real-time messaging                      │
│  - References users by TMS user IDs                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: User Search

### Current Implementation (✅ CORRECT)

When a user searches for people to chat with:

1. **User types in search box** → e.g., "John Doe"
2. **Client calls** → `userService.searchUsers({ query: "John Doe", limit: 20 })`
3. **userService calls** → `tmsApi.searchUsers("John Doe", 20)`
4. **tmsApi makes HTTPS request** → `GET https://gcgc-team-management-system-staging.up.railway.app/api/v1/users/search?q=John%20Doe&limit=20`
5. **Team Management System responds** → Returns array of matching users
6. **Client displays results** → Shows users with their profiles, images, positions, etc.

### Key Files

- **`src/features/users/services/userService.ts`** - Handles user operations, delegates to `tmsApi`
- **`src/lib/tmsApi.ts`** - Direct client to Team Management System API
- **`src/components/layout/CenterPanel.tsx`** - Loads initial conversations by searching users

---

## Authentication Flow

```
1. User visits TMS Client
   ↓
2. Redirected to login page
   ↓
3. Enters credentials
   ↓
4. authService.login() calls Team Management System
   ↓
5. Team Management System validates credentials
   ↓
6. Returns session cookie + JWT token
   ↓
7. Client stores JWT token in localStorage
   ↓
8. Client authenticates with TMS Server using JWT
   ↓
9. User can now:
   - Search users (from Team Management System)
   - Create conversations (in TMS Server)
   - Send messages (via TMS Server WebSocket)
```

---

## User Data Sources

| Data Type | Source | How It's Fetched |
|-----------|--------|------------------|
| **User List** | Team Management System | `tmsApi.searchUsers()` |
| **Current User** | Team Management System | `tmsApi.getCurrentUser()` |
| **User Profile** | Team Management System | `tmsApi.getUserById()` |
| **Conversations** | TMS Server | `conversationService.getConversations()` |
| **Messages** | TMS Server | `messageService.getMessages()` |

---

## Important Notes

### 1. **Users Are NOT Stored in TMS Server Database**

The TMS Server backend does NOT have a `users` table. Instead:

- **Conversations table** stores `created_by` as TMS user ID (string reference)
- **Messages table** stores `sender_id` as TMS user ID (string reference)
- **User data** is fetched from Team Management System when needed

### 2. **Session-Based Authentication**

Team Management System uses **NextAuth session cookies**:

```typescript
// All requests to Team Management System include session cookies
fetch(`${TMS_API_URL}/api/v1/users/search`, {
  credentials: 'include', // ← Critical! Sends session cookies
});
```

### 3. **JWT Token for Cross-Domain Auth**

Since TMS Client and Team Management are on different domains:

1. After login, get JWT token from Team Management: `/api/v1/auth/token`
2. Store in `localStorage`
3. Use for authenticating with TMS Server backend

---

## Environment Variables

### Team Management System

No configuration needed in Team Management - it's the source of truth.

### TMS Client

```bash
# Team Management System API
NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL=https://gcgc-team-management-system-staging.up.railway.app

# TMS Server Backend API (for conversations/messages only)
NEXT_PUBLIC_API_URL=https://tms-server-staging.up.railway.app/api/v1
NEXT_PUBLIC_WS_URL=wss://tms-server-staging.up.railway.app
```

### TMS Server

```bash
# Team Management System connection
USER_MANAGEMENT_API_URL=https://gcgc-team-management-system-staging.up.railway.app
USER_MANAGEMENT_API_KEY=REDACTED_API_KEY

# Allow TMS Client to make requests
ALLOWED_ORIGINS=https://tms-client-staging.up.railway.app
```

---

## Common Scenarios

### Scenario 1: New User Added in Team Management System

1. Admin creates new user "Jane Smith" in Team Management
2. Jane can immediately:
   - Login to TMS Client (credentials validated by Team Management)
   - Appear in search results when others search for "Jane"
   - Start receiving messages

**No sync needed** - data flows directly from source of truth!

### Scenario 2: User Profile Updated in Team Management

1. User changes profile picture in Team Management
2. TMS Client shows updated picture immediately on next search
3. **Why?** Because TMS Client fetches fresh data from Team Management on every search

### Scenario 3: User Starts a Conversation

1. Alice searches for "Bob" → finds Bob from Team Management System
2. Alice clicks "Start Chat" → TMS Client creates conversation in TMS Server
3. Conversation stored with:
   ```json
   {
     "id": "conv-uuid-123",
     "type": "dm",
     "created_by": "bob-tms-user-id",  // Reference to TMS user
     "members": ["alice-tms-user-id", "bob-tms-user-id"]
   }
   ```
4. When displaying conversation, TMS Client fetches Bob's latest profile from Team Management

---

## API Endpoints Reference

### Team Management System (Read-Only for TMS)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/users/me` | GET | Get current authenticated user |
| `/api/v1/users/search` | GET | Search all users by name/email |
| `/api/v1/users/{id}` | GET | Get specific user by ID |
| `/api/v1/auth/token` | GET | Get JWT token for cross-domain auth |

### TMS Server (Conversations & Messages)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/conversations` | GET | Get user's conversations |
| `/api/v1/conversations` | POST | Create new conversation |
| `/api/v1/conversations/{id}/messages` | GET | Get conversation messages |
| `/api/v1/messages` | POST | Send new message |
| WebSocket `/ws` | - | Real-time messaging |

---

## Troubleshooting

### Issue: "No users found" when searching

**Cause:** Can't connect to Team Management System API
**Solution:**
1. Check `NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL` is set correctly
2. Verify Team Management System is running
3. Check browser console for CORS or network errors
4. Verify session cookies are being sent (`credentials: 'include'`)

### Issue: "Failed to authenticate"

**Cause:** Session expired or invalid credentials
**Solution:**
1. Logout and login again to get fresh session
2. Check Team Management System authentication is working
3. Verify JWT token endpoint `/api/v1/auth/token` returns valid token

### Issue: User profile shows old data

**Cause:** Cached user data in TMS Client
**Solution:**
- User data is fetched fresh on each search - clear browser cache
- Check Team Management System has the updated data

---

## Summary

✅ **Users**: Stored and managed in Team Management System
✅ **Search**: Fetches directly from Team Management System
✅ **Authentication**: Uses Team Management System session + JWT
✅ **Conversations**: Stored in TMS Server, reference users by TMS ID
✅ **Messages**: Stored in TMS Server, reference senders by TMS ID

**Single Source of Truth**: GCGC Team Management System
**Data Ownership**: Team Management owns users, TMS Server owns conversations/messages
