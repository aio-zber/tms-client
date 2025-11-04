# API Guidelines for TMS Client

## Architecture Overview

```
┌─────────────┐
│ tms-client  │  Frontend (Browser)
│  (Next.js)  │
└──────┬──────┘
       │ All API calls use JWT Bearer tokens
       │ NO direct calls to gcgc allowed!
       ↓
┌─────────────┐
│ tms-server  │  Backend API
│  (FastAPI)  │
└──────┬──────┘
       │ Server-to-server communication
       │ Uses API keys for authentication
       ↓
┌─────────────┐
│   gcgc      │  Team Management System
│  (Next.js)  │
└─────────────┘
```

## ⚠️ CRITICAL RULES

### ❌ NEVER DO THIS
```typescript
// ❌ DON'T call GCGC directly from browser
await fetch('https://gcgc-team-management-system-staging.up.railway.app/api/v1/users/search', {
  credentials: 'include'
});

// ❌ DON'T use hardcoded URLs
await fetch('https://tms-server-staging.up.railway.app/api/v1/users/me');

// ❌ DON'T use environment variables directly
await fetch(`${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/users`);
```

**Why?**
- ❌ Causes CORS errors (cross-origin blocking)
- ❌ Session cookies don't work cross-domain
- ❌ Authentication fails
- ❌ Redirect loops

### ✅ ALWAYS DO THIS
```typescript
// ✅ Use the centralized getApiBaseUrl() helper
import { getApiBaseUrl } from '@/lib/constants';

const apiBaseUrl = getApiBaseUrl(); // Points to tms-server
await fetch(`${apiBaseUrl}/users/search?q=kyle`);

// ✅ Use STORAGE_KEYS constants for localStorage
import { STORAGE_KEYS } from '@/lib/constants';

const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
```

**Why?**
- ✅ No CORS issues (same-origin requests)
- ✅ JWT authentication works correctly
- ✅ Environment-aware (auto-detects staging/production)
- ✅ Consistent and maintainable

---

## Available API Helpers

### 1. **Centralized API Client** (Recommended)

Use `apiClient` for most API calls:

```typescript
import { apiClient } from '@/lib/apiClient';

// GET request
const users = await apiClient.get('/users/', { q: 'kyle', limit: 20 });

// POST request
const message = await apiClient.post('/conversations/123/messages', {
  content: 'Hello!'
});

// PUT request
await apiClient.put('/users/me', { displayName: 'New Name' });

// DELETE request
await apiClient.delete('/conversations/123/messages/456');

// File upload
await apiClient.uploadFile('/users/me/avatar', fileObject);
```

**Features:**
- ✅ Automatic JWT Bearer token injection
- ✅ Error handling
- ✅ Request/response logging
- ✅ Proper Content-Type headers

### 2. **TMS API Client** (For user operations)

Use `tmsApi` for user-specific operations:

```typescript
import { tmsApi } from '@/lib/tmsApi';

// Get current user
const user = await tmsApi.getCurrentUser();

// Get user by ID
const profile = await tmsApi.getUserById('user-123');

// Search users
const results = await tmsApi.searchUsers('john', 10);
```

### 3. **Auth Service** (For authentication)

Use `authService` for auth operations:

```typescript
import { authService } from '@/features/auth/services/authService';

// Login
await authService.login({ email, password });

// Logout
await authService.logout();

// Check authentication
const isAuth = authService.isAuthenticated();

// Validate session
const isValid = await authService.validateSession();
```

---

## Storage Keys

**Always use constants for localStorage:**

```typescript
import { STORAGE_KEYS } from '@/lib/constants';

// ✅ CORRECT
localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);

// ❌ WRONG
localStorage.setItem('auth_token', token);
localStorage.setItem('tms_auth_token', token); // Inconsistent key!
```

**Available keys:**
- `STORAGE_KEYS.AUTH_TOKEN` - JWT authentication token
- `STORAGE_KEYS.USER_DATA` - Cached user profile
- `STORAGE_KEYS.THEME` - UI theme preference
- `STORAGE_KEYS.LANGUAGE` - Language preference

---

## API Endpoint Mapping

### User Endpoints

| Operation | tms-client → tms-server | tms-server → gcgc |
|-----------|------------------------|-------------------|
| Get current user | `GET /users/me` | `GET /api/v1/users/me` |
| Get user by ID | `GET /users/{id}` | `GET /api/v1/users/{id}` |
| Search users | `GET /users/?q=query` | `GET /api/v1/users/search` |

### Auth Endpoints

| Operation | tms-client → tms-server | tms-server → gcgc |
|-----------|------------------------|-------------------|
| Login | `POST /auth/login/credentials` | `POST /api/v1/auth/login` |
| Logout | `POST /auth/logout` | - |

### Conversation Endpoints

| Operation | tms-client → tms-server |
|-----------|------------------------|
| List conversations | `GET /conversations/` |
| Get conversation | `GET /conversations/{id}` |
| Create conversation | `POST /conversations/` |

### Message Endpoints

| Operation | tms-client → tms-server |
|-----------|------------------------|
| List messages | `GET /conversations/{id}/messages` |
| Send message | `POST /conversations/{id}/messages` |
| Edit message | `PUT /conversations/{id}/messages/{msg_id}` |
| Delete message | `DELETE /conversations/{id}/messages/{msg_id}` |

---

## Authentication Flow

```typescript
// 1. User logs in
await authService.login({ email, password });
// → JWT token stored in localStorage[STORAGE_KEYS.AUTH_TOKEN]

// 2. All subsequent API calls include Bearer token
const apiBaseUrl = getApiBaseUrl();
await fetch(`${apiBaseUrl}/users/me`, {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)}`,
    'Content-Type': 'application/json'
  }
});

// 3. On logout
await authService.logout();
// → Token removed from localStorage
```

---

## Error Handling

```typescript
import { apiClient, ApiError } from '@/lib/apiClient';

try {
  const users = await apiClient.get('/users/', { q: 'kyle' });
} catch (error) {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      // Unauthorized - redirect to login
      router.push('/login');
    } else if (error.statusCode === 403) {
      // Forbidden - show permission error
      toast.error('You do not have permission');
    } else {
      // Other API errors
      toast.error(error.message);
    }
  } else {
    // Network errors
    toast.error('Network error. Please check your connection.');
  }
}
```

---

## Common Patterns

### Pattern 1: Fetching Data with React Query

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

function useUsers(query: string) {
  return useQuery({
    queryKey: ['users', query],
    queryFn: () => apiClient.get('/users/', { q: query, limit: 20 }),
    enabled: query.length > 0,
  });
}
```

### Pattern 2: Mutations with React Query

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      apiClient.post(`/conversations/${conversationId}/messages`, { content }),
    onSuccess: () => {
      // Invalidate messages to refetch
      queryClient.invalidateQueries(['messages', conversationId]);
    },
  });
}
```

### Pattern 3: Protected Routes

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/features/auth/services/authService';

export default function ProtectedPage() {
  const router = useRouter();

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/login');
    }
  }, [router]);

  return <div>Protected content</div>;
}
```

---

## Testing API Calls

### Development Console

All API calls are logged to the browser console:

```
[Fetch Interceptor] Request: {
  url: 'https://tms-server-staging.up.railway.app/api/v1/users/me',
  method: 'GET',
  hasBody: false,
  timestamp: '2025-11-04T12:34:56.789Z'
}
```

### Manual Testing

```typescript
// Test in browser console
import { apiClient } from '@/lib/apiClient';

// Test user search
await apiClient.get('/users/', { q: 'kyle' });

// Test message send
await apiClient.post('/conversations/123/messages', { content: 'Test' });
```

---

## Checklist for New Features

Before implementing a new API feature:

- [ ] Identify the backend endpoint (tms-server)
- [ ] Use `getApiBaseUrl()` for dynamic URL
- [ ] Use `apiClient` or `tmsApi` for requests
- [ ] Include JWT Bearer token authentication
- [ ] Use `STORAGE_KEYS` constants for localStorage
- [ ] Add proper error handling
- [ ] Test in both development and staging
- [ ] Verify no CORS errors in browser console

---

## Troubleshooting

### Problem: CORS Error
```
Access to fetch at 'https://gcgc-team-management...' from origin 'https://tms-client...'
has been blocked by CORS policy
```

**Solution:** You're calling GCGC directly. Use `getApiBaseUrl()` to call tms-server instead.

### Problem: 401 Unauthorized
```
HTTP 401: Unauthorized
```

**Solution:**
1. Check JWT token exists: `localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)`
2. Verify token is included in headers: Check Network tab
3. Token might be expired - try logging in again

### Problem: Redirect Loop
```
/login → /chats → /login → /chats → ...
```

**Solution:** Check that all API calls use the correct storage key and route through tms-server.

---

## Summary

✅ **DO:**
- Use `getApiBaseUrl()` for all API calls
- Use `apiClient` or `tmsApi` for requests
- Use `STORAGE_KEYS` constants
- Route all requests through tms-server
- Include JWT Bearer token in headers

❌ **DON'T:**
- Call GCGC directly from browser
- Use hardcoded URLs
- Use inconsistent localStorage keys
- Skip error handling
- Bypass authentication

Following these guidelines ensures **no CORS issues** and **consistent authentication** across your entire application! 🎉
