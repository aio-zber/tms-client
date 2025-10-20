# 🐛 Troubleshooting: User 1 Can't See Messages

## Issue Summary

User 1 sees "No messages yet" in the conversation list, while other users can see conversations and messages.

---

## Quick Diagnostics

### Step 1: Open Browser Console (F12)

Look for these key logs when User 1 logs in:

#### 1.1 Check User Authentication
```javascript
// Should see:
[ChatPage] Current user: { id: "...", email: "...", ... }
[ChatPage] Current user ID: "some-uuid-here"
```

**❌ If missing:** User 1 is not authenticated properly
**✅ Fix:** Check if auth token is valid in localStorage

---

#### 1.2 Check Conversations API
```javascript
// Should see:
[CenterPanel] API Response: { data: [...], pagination: {...} }
[CenterPanel] Conversations data: [array of conversations]
```

**❌ If empty array:** Backend isn't returning conversations for User 1
**✅ Fix:** Check if User 1 is a member of any conversations in the database

---

#### 1.3 Check Messages API
```javascript
// Should see:
[useMessages] Fetched X messages from DB
[MessageList] Props received: { messagesCount: X, ... }
```

**❌ If 0 messages:** Messages not loading from backend
**✅ Fix:** Check backend logs for errors

---

## Root Cause Analysis

### Possible Causes:

### 1. **User 1 Not in Database** (Most Likely)
   
**Symptoms:**
- `/users/me` endpoint returns 404
- Console shows "User not found in database"

**Why this happens:**
- User 1 hasn't been synced from GCGC TMS to tms-server database
- User 1 exists in GCGC TMS but not in local `users` table

**Fix:**
```bash
# Check if User 1 exists in database
# Connect to Railway PostgreSQL
psql <your-database-url>

# Check users table
SELECT id, tms_user_id, email, display_name FROM users;

# If User 1 not found, they need to:
# 1. Log out of the chat system
# 2. Log in again (this triggers user sync)
# 3. Or manually sync via TMS admin panel
```

---

### 2. **User 1 Not a Member of Any Conversations**

**Symptoms:**
- `/users/me` works fine
- `/conversations` returns empty array
- Other users see conversations

**Fix:**
```sql
-- Check conversation memberships
SELECT cm.*, c.name, c.type 
FROM conversation_members cm
JOIN conversations c ON c.id = cm.conversation_id
JOIN users u ON u.id = cm.user_id
WHERE u.email = 'user1@example.com';  -- Replace with User 1's email

-- If no results, User 1 needs to be added to conversations
-- Create a test conversation:
INSERT INTO conversations (id, name, type, created_by, created_at)
VALUES (gen_random_uuid(), 'Test Chat', 'dm', '<user1-uuid>', now());

-- Add User 1 as member
INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
VALUES ('<conversation-uuid>', '<user1-uuid>', 'member', now());
```

---

### 3. **Authentication Token Issue**

**Symptoms:**
- API calls return 401 Unauthorized
- Console shows "Invalid authorization header"

**Fix:**
```javascript
// In browser console, check token:
localStorage.getItem('auth_token')

// Should return a JWT token
// If null or invalid:
// 1. Clear storage
localStorage.clear()

// 2. Log out and log in again
```

---

### 4. **User ID Mismatch**

**Symptoms:**
- Messages load but don't display
- `currentUserId` doesn't match `message.senderId`

**Debug:**
```javascript
// In ChatPage console logs, compare:
[ChatPage] Current user ID: "abc-123-xyz"  // User 1's ID
[MessageList] Message senderId: "def-456-uvw"  // Different ID = won't show as "sent"

// If IDs use different formats, this is the issue
```

**Fix:**
- Ensure `/users/me` returns the same ID format as `message.sender_id`
- Both should be UUIDs from the local database

---

## Step-by-Step Debugging for User 1

### 1. **Check User 1's Authentication**

```javascript
// In browser console (User 1's browser)
const token = localStorage.getItem('auth_token');
console.log('Token:', token ? 'Present' : 'Missing');

// If present, decode it (paste in jwt.io)
// Check expiry and user ID in payload
```

---

### 2. **Check /users/me Endpoint**

```javascript
// In browser console
const token = localStorage.getItem('auth_token');
fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => console.log('User /me response:', data))
.catch(err => console.error('Error:', err));
```

**Expected Response:**
```json
{
  "id": "uuid-here",
  "tms_user_id": "tms-id-here",
  "email": "user1@example.com",
  "display_name": "User 1 Name",
  ...
}
```

---

### 3. **Check /conversations Endpoint**

```javascript
// In browser console
const token = localStorage.getItem('auth_token');
fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/conversations?limit=50&offset=0`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => console.log('Conversations response:', data))
.catch(err => console.error('Error:', err));
```

**Expected Response:**
```json
{
  "data": [
    {
      "id": "conversation-uuid",
      "name": "Chat with User 2",
      "type": "dm",
      "members": [...]
    }
  ],
  "pagination": {...}
}
```

**❌ If `data` is empty:** User 1 isn't a member of any conversations!

---

### 4. **Check Railway Backend Logs**

```bash
# Look for errors when User 1 tries to load data:
# Railway Dashboard → tms-server → Deployments → View Logs

# Search for:
- "User not found"
- "Invalid token"
- "Failed to fetch"
- "401 Unauthorized"
- "403 Forbidden"
```

---

## Quick Fixes

### Fix 1: Force User Sync

If User 1 doesn't exist in database:

```bash
# As admin, call sync endpoint:
curl -X POST "https://your-tms-server.railway.app/api/v1/users/sync" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"tms_user_ids": ["user1-tms-id"], "force": true}'
```

---

### Fix 2: Create Test Conversation

If User 1 exists but has no conversations:

```sql
-- Connect to Railway database
-- Create a DM conversation between User 1 and User 2

-- 1. Get User IDs
SELECT id, email FROM users WHERE email IN ('user1@example.com', 'user2@example.com');

-- 2. Create conversation
INSERT INTO conversations (id, name, type, created_by, created_at)
VALUES (gen_random_uuid(), NULL, 'dm', '<user1-id>', now())
RETURNING id;

-- 3. Add both users as members
INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
VALUES 
  ('<conversation-id>', '<user1-id>', 'member', now()),
  ('<conversation-id>', '<user2-id>', 'member', now());

-- 4. Send a test message
INSERT INTO messages (id, conversation_id, sender_id, content, type, created_at)
VALUES (gen_random_uuid(), '<conversation-id>', '<user2-id>', 'Hello User 1!', 'text', now());
```

---

### Fix 3: Clear Cache and Re-login

```javascript
// In User 1's browser console:
localStorage.clear();
sessionStorage.clear();

// Then log out and log in again
```

---

## Expected Behavior After Fix

After fixing, User 1 should see:

1. ✅ Conversation list populates with conversations
2. ✅ Can click on a conversation
3. ✅ Messages load in the chat window
4. ✅ Can send new messages
5. ✅ Can see their own sent messages immediately (optimistic update)
6. ✅ Real-time updates when other users send messages

---

## Still Not Working?

If User 1 still can't see messages after trying all fixes:

### Send Debug Information:

1. **Browser Console Logs** (F12 → Console tab)
   - Copy all logs when User 1 tries to load chats
   
2. **Network Tab** (F12 → Network tab)
   - Filter: XHR
   - Click on `/conversations` request
   - Copy Response

3. **Railway Backend Logs**
   - When User 1 loads the page
   - Look for errors or warnings

4. **Database Query**
```sql
-- Run this and share results:
SELECT 
  u.id as user_id,
  u.email,
  u.display_name,
  COUNT(cm.id) as conversation_count,
  COUNT(m.id) as message_count
FROM users u
LEFT JOIN conversation_members cm ON u.id = cm.user_id
LEFT JOIN messages m ON m.sender_id = u.id
WHERE u.email = 'user1@example.com'
GROUP BY u.id, u.email, u.display_name;
```

---

## Summary

**Most common fix:** User 1 likely isn't in the database or isn't a member of any conversations.

**Quick test:** Have User 2 create a new conversation with User 1, then check if User 1 can see it.

**Contact support with:**
- Console logs
- Network requests/responses  
- Database query results
- Railway backend logs

This will help diagnose the exact issue! 🔍

