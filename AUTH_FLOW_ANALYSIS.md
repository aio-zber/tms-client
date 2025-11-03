# TMS-Client Authentication Flow Analysis

**Date:** 2025-11-03  
**Codebase:** `/home/aiofficer/Workspace/tms-client`  
**Thoroughness Level:** Very Thorough  

---

## Executive Summary

The tms-client uses a **two-tier authentication system** combining:
1. **GCGC Team Management System (OAuth/NextAuth)** - External user identity provider
2. **TMS-Server Backend** - Application-level authentication and JWT token management

The flow is: **GCGC OAuth → JWT Token → TMS-Server → Protected Resources**

Key characteristics:
- Client-side rendered (Next.js 14 App Router)
- Session-based with JWT token fallback
- No built-in Next.js middleware for route protection
- Runtime API URL detection for Railway deployments
- Fetch interceptor for debugging

---

## 1. Authentication Architecture Overview

### System Components

```
┌──────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   TMS-Client         │     │   TMS-Server     │     │ GCGC Team Mgmt  │
│   (Next.js Browser)  │────▶│   (FastAPI)      │────▶│  System         │
└──────────────────────┘     └──────────────────┘     └─────────────────┘
   - React Components        - JWT Validation        - OAuth Provider
   - Zustand Stores          - User Sync              - User Database
   - Socket.IO Client        - Conversation CRUD     - Role Management
```

### Authentication Methods

| Method | Endpoint | Purpose | Token |
|--------|----------|---------|-------|
| GCGC OAuth | `/api/auth/signin/credentials` | Initial credential validation | Session Cookie |
| Get JWT Token | `/api/v1/auth/token` | Obtain JWT from GCGC | JWT (stored in localStorage) |
| TMS-Server Auth | `/api/v1/auth/login` | Backend validation | JWT Bearer Token |
| Get Current User | `/api/v1/users/me` | Fetch authenticated user | JWT Bearer Token |
| Session Validation | `/api/v1/users/me` | Validate session | JWT Bearer Token |

---

## 2. Complete Login Flow (Step-by-Step)

### Phase 1: User Submits Credentials (Login Page)

**File:** `/src/app/(auth)/login/page.tsx`

1. User enters email and password on login form
2. Form validation with Zod schema
3. Click "Sign In" button
4. Call `useAuth().login(credentials)`

```typescript
// Step 1: Form submission
const onSubmit = async (data: LoginFormValues) => {
  await login({
    email: data.email,
    password: data.password,
  });
  router.push('/chats');
};
```

### Phase 2: Auth Store Processing (Zustand)

**File:** `/src/store/authStore.ts` → `login()` action

1. Set loading state: `{ isLoading: true }`
2. Call `authService.login(credentials)`
3. Handle success/error and update state

### Phase 3: GCGC Authentication

**File:** `/src/features/auth/services/authService.ts` → `login()` method

**Step 1: Authenticate with GCGC**
```typescript
const signinResponse = await fetch(
  `${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/auth/signin/credentials`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'include', // Include session cookies
    body: new URLSearchParams({
      email: credentials.email,
      password: credentials.password,
      redirect: 'false',
      json: 'true'
    }).toString(),
  }
);
```

**Endpoint:** `https://gcgc-team-management-system-staging.up.railway.app/api/auth/signin/credentials`

**Request:**
- Method: POST
- Content-Type: application/x-www-form-urlencoded
- Body: email, password, redirect=false, json=true
- Credentials: include (for session cookies)

**Response on success:** 200 OK with session established

**Step 2: Get JWT Token from GCGC**
```typescript
const tokenResponse = await fetch(
  `${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/auth/token`,
  { credentials: 'include' }
);

if (tokenResponse.ok) {
  const tokenData = await tokenResponse.json();
  const jwtToken = tokenData.token;
  
  // Store in localStorage
  localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, jwtToken);
}
```

**Endpoint:** `https://gcgc-team-management-system-staging.up.railway.app/api/v1/auth/token`

**Request:**
- Method: GET
- Credentials: include (session cookie)

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Phase 4: TMS-Server Authentication

**File:** `/src/features/auth/services/authService.ts` → `login()` method (continued)

**Step 3: Send JWT to TMS-Server**
```typescript
const apiBaseUrl = getApiBaseUrl(); // Runtime detection
const authEndpoint = `${apiBaseUrl}/api/v1/auth/login`;

const backendAuthResponse = await fetch(authEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ token: jwtToken }),
});

const backendData = await backendAuthResponse.json();
const userData = backendData.user;
```

**Endpoint:** `http://localhost:8000/api/v1/auth/login` (local) or `https://tms-server-staging.up.railway.app/api/v1/auth/login` (production)

**Request:**
- Method: POST
- Content-Type: application/json
- Body: `{ "token": "JWT_TOKEN_HERE" }`

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "local-uuid",
    "tms_user_id": "gcgc-user-id",
    "email": "user@example.com",
    "username": "johndoe",
    "display_name": "John Doe",
    "first_name": "John",
    "last_name": "Doe",
    "role": "MEMBER",
    ...
  }
}
```

### Phase 5: State Management & Session Storage

**File:** `/src/store/authStore.ts`

After successful TMS-Server authentication:

```typescript
set({
  token: 'session-active', // Session-based indicator
  isAuthenticated: true,
  isLoading: false,
  error: null,
});

// Also set session active flag
authService.setSessionActive(true);
```

**Storage:**
- `localStorage['auth_token']` = JWT token (from GCGC)
- `localStorage['tms_session_active']` = 'true'
- `localStorage['user_data']` = User object (cached)

### Phase 6: Fetch Current User Data

**File:** `/src/store/authStore.ts` (after login)

```typescript
try {
  await userService.getCurrentUser();
} catch (userError) {
  console.error('Failed to fetch user after login:', userError);
  // Continue anyway - user data will be fetched on next request
}
```

**File:** `/src/features/users/services/userService.ts`

```typescript
async getCurrentUser(): Promise<User> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/users/me`,
    {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const userData = await response.json();
  
  // Transform and cache
  localStorage.setItem('user_data', JSON.stringify(user));
  return user;
}
```

**Endpoint:** `http://localhost:8000/api/v1/users/me` (local)

**Request:**
- Method: GET
- Authorization: Bearer {JWT_TOKEN}

### Phase 7: Redirect to Chat

**File:** `/src/app/(auth)/login/page.tsx`

```typescript
// Success! Show toast and redirect
toast.success('Login successful! Redirecting to chats...', {
  duration: 2000,
  icon: '✅',
});

setTimeout(() => {
  router.push('/chats');
}, 500);
```

**Flow diagram:**
```
Login Form
    ↓
[Validate with Zod]
    ↓
Zustand Auth Store
    ↓
authService.login()
    ↓
[1] POST /api/auth/signin/credentials (GCGC)
    ↓
[2] GET /api/v1/auth/token (GCGC) → Get JWT
    ↓
[3] Store JWT in localStorage
    ↓
[4] POST /api/v1/auth/login (TMS-Server) → Validate JWT
    ↓
[5] Get User Data (TMS-Server)
    ↓
[6] Update Auth Store (authenticated: true)
    ↓
[7] Fetch Current User
    ↓
[8] Cache User in localStorage
    ↓
[9] Redirect to /chats
```

---

## 3. JWT Token Management

### Token Acquisition

**Source:** GCGC Team Management System  
**Endpoint:** `GET /api/v1/auth/token`  
**Triggered:** During login phase (Step 2)  

### Token Storage

**Location:** Browser localStorage  
**Key:** `STORAGE_KEYS.AUTH_TOKEN` = `'auth_token'`  
**Value:** JWT token string (encoded)  
**Access:** `localStorage.getItem('auth_token')`  

### Token Structure

JWT tokens are JSON Web Tokens with three parts:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Decoded payload (example):
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "iat": 1651234567,
  "exp": 1651321000
}
```

### Token Validation

**Method 1: Local Validation (Frontend)**
- Check localStorage for `auth_token`
- Check `tms_session_active` flag

**Method 2: Server Validation**
- TMS-Server validates JWT signature on every request
- Uses `JWT_SECRET` (must match GCGC's NEXTAUTH_SECRET)
- Returns 401 if invalid/expired

### Token Refresh

**Current Implementation:** No automatic refresh  
**On Expiration:** User forced to re-login (no refresh token mechanism)  

### Token Revocation (Logout)

**File:** `/src/features/auth/services/authService.ts` → `logout()` method

```typescript
async logout(): Promise<void> {
  try {
    // Call GCGC signout endpoint
    await fetch(
      `${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/auth/signout`,
      {
        method: 'POST',
        credentials: 'include',
      }
    );
  } catch (error) {
    console.warn('Team Management System logout failed:', error);
  } finally {
    // Clear all auth data locally
    authService.setSessionActive(false);
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    localStorage.removeItem('tms_session_active');
  }
}
```

**Endpoints Called:**
1. `POST /api/auth/signout` (GCGC) - Invalidate session
2. Clear localStorage

---

## 4. Session Validation

### Automatic Session Checks

**Triggered on:**
1. App initialization (page.tsx useEffect)
2. Manual calls via `useAuth().checkAuth()`
3. On route change to protected pages

**File:** `/src/store/authStore.ts` → `checkAuth()` action

```typescript
checkAuth: async () => {
  set({ isLoading: true });

  try {
    const isAuthenticated = authService.isAuthenticated();

    if (!isAuthenticated) {
      set({
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return;
    }

    // Validate session by attempting to use it
    const isValid = await authService.validateSession();

    if (isValid) {
      set({
        token: 'session-active',
        isAuthenticated: true,
        isLoading: false,
      });

      // Fetch user data if authenticated
      try {
        await userService.getCurrentUser();
      } catch {
        // User data fetch failed, but session is valid
      }
    } else {
      // Session is invalid, clear everything
      await authService.logout();
      set({
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    await authService.logout();
    set({
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }
}
```

**File:** `/src/features/auth/services/authService.ts` → `validateSession()` method

```typescript
async validateSession(): Promise<boolean> {
  if (!this.isAuthenticated()) return false;

  try {
    const jwtToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

    if (!jwtToken) {
      this.setSessionActive(false);
      return false;
    }

    const apiBaseUrl = getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/v1/users/me`, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const isValid = response.ok;
    if (!isValid) {
      this.setSessionActive(false);
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    }
    return isValid;
  } catch {
    this.setSessionActive(false);
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    return false;
  }
}
```

**Validation Steps:**
1. Check `localStorage['tms_session_active'] === 'true'`
2. Check `localStorage['auth_token']` exists
3. Call `/api/v1/users/me` with JWT token
4. If 401 or network error: clear token and session flag
5. Return validation result

---

## 5. API Endpoints Called During Authentication

### GCGC Endpoints (External - User Management)

| Endpoint | Method | Purpose | Credentials | Token |
|----------|--------|---------|-------------|-------|
| `/api/auth/signin/credentials` | POST | Authenticate user with credentials | Session cookies | None |
| `/api/v1/auth/token` | GET | Get JWT token after auth | Session cookies | None |
| `/api/auth/signout` | POST | Invalidate session | Session cookies | None |

**Base URL:** `NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL` = `https://gcgc-team-management-system-staging.up.railway.app`

### TMS-Server Endpoints (Internal - Application)

| Endpoint | Method | Purpose | Token Type |
|----------|--------|---------|-----------|
| `/api/v1/auth/login` | POST | Validate JWT and get user | JWT Bearer |
| `/api/v1/users/me` | GET | Get current user data | JWT Bearer |
| `/api/v1/conversations` | GET | Get user's conversations | JWT Bearer |
| `/api/v1/messages/{id}` | GET | Get messages | JWT Bearer |
| `/api/v1/messages` | POST | Send message | JWT Bearer |
| `/socket.io` | WS | Real-time messaging | JWT in query param |

**Base URL:** Runtime-detected (see runtimeConfig.ts)
- Local: `http://localhost:8000/api/v1`
- Railway: `https://tms-server-staging.up.railway.app/api/v1`

### Endpoint Call Order During Login

```
1. POST GCGC /api/auth/signin/credentials
   ↓ (on success)
2. GET GCGC /api/v1/auth/token
   ↓ (receive JWT)
3. POST TMS-Server /api/v1/auth/login
   ↓ (validate JWT, get user)
4. GET TMS-Server /api/v1/users/me
   ↓ (fetch user details with JWT)
5. (Redirects to /chats)
```

---

## 6. Token Usage in Requests

### How JWT Token is Included

**File:** `/src/lib/apiClient.ts`

```typescript
private getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  // Try to get token from authService (session-based)
  const sessionToken = authService.getStoredToken();
  if (sessionToken && sessionToken !== 'session-active') {
    return sessionToken;
  }

  // Fallback to localStorage (token-based)
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

private getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  const token = this.getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}
```

### Every API Request Includes

```
GET /api/v1/conversations
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

### Who Uses This Token

1. **apiClient** - All HTTP requests to TMS-Server
2. **userService** - Get user data
3. **messageService** - Send/receive messages
4. **conversationService** - Manage conversations
5. **WebSocket** - Connected with token in query params (optional)

---

## 7. Protected Route Implementation

### Current Route Protection Strategy

**Next.js 14 App Router with Client-Side Guards**

**No middleware file exists** - Route protection is client-side only

### Root Page Redirect (`/`)

**File:** `/src/app/page.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    // Check authentication status on load
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // Redirect based on authentication state
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/chats');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-viber-purple border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return null;
}
```

**Logic:**
1. On page load: Call `checkAuth()` to validate session
2. While loading: Show spinner
3. After loading:
   - If authenticated → Redirect to `/chats`
   - If not authenticated → Redirect to `/login`

### Protected Routes Layout (`/chats`)

**File:** `/src/app/(main)/layout.tsx`

```typescript
'use client';

import { usePathname } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { CenterPanel } from '@/components/layout/CenterPanel';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ... Layout code
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <AppHeader />
      {/* ... rest of layout */}
    </div>
  );
}
```

**Protection in AppHeader:**

**File:** `/src/components/layout/AppHeader.tsx`

```typescript
useEffect(() => {
  const loadUser = async () => {
    try {
      // Get user data from GCGC Team Management System
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/users/me`,
        {
          credentials: 'include', // Include session cookies
        }
      );

      if (response.ok) {
        const userData = await response.json();
        setUser(userData as User);
      } else if (response.status === 401) {
        // Session expired, redirect to login
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
      // Redirect to login on any error
      window.location.href = '/login';
    }
  };

  loadUser();
}, []);
```

**⚠️ ISSUE FOUND:** AppHeader loads user from GCGC directly, should load from TMS-Server

### Route Organization

```
/                          → Redirect based on auth state
  /login                   → Login form (public)
  /chats                   → Protected (main app)
    /chats/[id]            → Chat window (protected)
```

---

## 8. GCGC API Calls

### Called During Authentication Flow

1. **Step 1: Sign In with Credentials**
   ```
   POST /api/auth/signin/credentials
   Payload: email, password, redirect=false, json=true
   Purpose: Authenticate user, establish session
   ```

2. **Step 2: Get JWT Token**
   ```
   GET /api/v1/auth/token
   Purpose: Retrieve JWT token for cross-service auth
   ```

3. **Step 4: Sign Out**
   ```
   POST /api/auth/signout
   Purpose: Invalidate session (called on logout)
   ```

### Called After Authentication (ISSUE)

**File:** `/src/components/layout/AppHeader.tsx` (Line 36)

```typescript
const response = await fetch(
  `${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/users/me`,
  { credentials: 'include' }
);
```

**⚠️ PROBLEM:** This directly calls GCGC after login
- Should call TMS-Server `/api/v1/users/me` instead
- Inconsistent with auth service pattern
- Causes unnecessary GCGC dependency

### User Search

**File:** `/src/lib/tmsApi.ts`

```typescript
async searchUsers(query: string, limit: number = 20): Promise<TMSUser[]> {
  const url = new URL(`${this.baseURL}/api/v1/users/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', limit.toString());

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: this.getHeaders(),
    credentials: 'include',
  });
  // ...
}
```

**Calls:** GCGC `/api/v1/users/search`  
**Purpose:** Search users for conversation creation  

---

## 9. TMS-Server API Calls

### Endpoints Used

1. **Authentication**
   ```
   POST /api/v1/auth/login
   Body: { token: JWT }
   Returns: { success, user }
   ```

2. **Get Current User**
   ```
   GET /api/v1/users/me
   Header: Authorization: Bearer JWT
   Returns: User object with local UUID
   ```

3. **Conversations**
   ```
   GET /api/v1/conversations
   GET /api/v1/conversations/{id}
   POST /api/v1/conversations
   PUT /api/v1/conversations/{id}
   ```

4. **Messages**
   ```
   GET /api/v1/messages?conversation_id={id}
   POST /api/v1/messages
   PUT /api/v1/messages/{id}
   DELETE /api/v1/messages/{id}
   ```

5. **WebSocket**
   ```
   WS /socket.io
   - Namespace: /messaging
   - Events: message:new, message:edit, typing:start, etc.
   ```

### Authorization Header

All requests include:
```
Authorization: Bearer {JWT_TOKEN}
```

The JWT token is validated by TMS-Server using the same `JWT_SECRET` as GCGC.

---

## 10. Issues and Inconsistencies Found

### Issue #1: AppHeader Loads User from GCGC (CRITICAL)

**Location:** `/src/components/layout/AppHeader.tsx`, lines 32-60

**Problem:**
- Loads current user from GCGC after login
- Inconsistent with authentication flow (which gets user from TMS-Server)
- Creates unnecessary GCGC dependency on every page load

**Current Code:**
```typescript
const response = await fetch(
  `${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/users/me`,
  { credentials: 'include' }
);
```

**Should Be:**
```typescript
const jwtToken = localStorage.getItem('auth_token');
const response = await fetch(
  `${getApiBaseUrl()}/api/v1/users/me`,
  {
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  }
);
```

**Impact:** Medium - Logout on 401 works, but adds latency and GCGC dependency

---

### Issue #2: User Store Calls Wrong Endpoint

**Location:** `/src/features/users/services/userService.ts`, line 35

**Problem:**
- Uses `process.env.NEXT_PUBLIC_API_URL` which is hardcoded
- Should use `getApiBaseUrl()` for runtime detection

**Current Code:**
```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me`, {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
    'Content-Type': 'application/json'
  }
});
```

**Issue:** In development, this might point to `http://localhost:8000/api/v1` but environment variables are `NEXT_PUBLIC_API_URL` not used by runtime detection

**Should Use:**
- `getApiBaseUrl()` from `/src/lib/runtimeConfig.ts` for proper Railway detection

---

### Issue #3: No Route-Level Middleware Protection

**Problem:**
- No `middleware.ts` file to protect routes server-side
- All protection is client-side (React components checking Zustand store)
- Direct access to `/chats` with invalid token shows loading then redirects

**Current Approach:**
```typescript
// In page.tsx
const { isAuthenticated } = useAuthStore();

useEffect(() => {
  if (!isAuthenticated) {
    router.push('/login');
  }
}, [isAuthenticated]);
```

**Risk:** User briefly sees protected page before redirect  
**Better Approach:** Add `middleware.ts` with JWT validation

---

### Issue #4: No Automatic Token Refresh

**Problem:**
- JWT tokens expire but no refresh mechanism
- When token expires, user must re-login
- No automatic renewal

**Current:** Tokens stored in localStorage with no TTL tracking  
**Could Add:** Token refresh endpoint call before expiration

---

### Issue #5: useAuth Hook Takes autoCheck Parameter But It's Not Always Used

**Location:** `/src/features/auth/hooks/useAuth.ts`

**Parameter:** `autoCheck: boolean = true` (default: true)

**Problem:**
- Login page uses `useAuth(false)` to skip auto-check
- But other pages might auto-check causing double API calls
- No deduplication mechanism

---

### Issue #6: AppHeader Doesn't Handle 401 Consistently

**Location:** `/src/components/layout/AppHeader.tsx`

```typescript
if (response.status === 401) {
  window.location.href = '/login';
}
```

**Problem:**
- Uses `window.location.href` (hard reload) instead of `router.push()`
- Inconsistent with other logout handling
- Clears all state instead of gracefully redirecting

---

### Issue #7: Multiple User Fetch Methods

Different parts of the app fetch user differently:

1. **authService.getCurrentUser()** → Calls TMS-Server
2. **userService.getCurrentUser()** → Calls TMS-Server (via NEXT_PUBLIC_API_URL)
3. **AppHeader.loadUser()** → Calls GCGC directly
4. **tmsApi** methods → Call GCGC

**Inconsistency:** Should have single source of truth

---

### Issue #8: No Error Boundary for Auth Failures

**Problem:**
- Auth failures in AppHeader cause hard page redirect
- No graceful error display
- User gets hard redirect without warning

---

## 11. Summary Table: Endpoint Calls

### During Login Sequence

| Order | System | Endpoint | Method | Token | Used From |
|-------|--------|----------|--------|-------|-----------|
| 1 | GCGC | `/api/auth/signin/credentials` | POST | Session | authService.login() |
| 2 | GCGC | `/api/v1/auth/token` | GET | Session | authService.login() |
| 3 | TMS-Server | `/api/v1/auth/login` | POST | JWT | authService.login() |
| 4 | TMS-Server | `/api/v1/users/me` | GET | JWT | userService.getCurrentUser() |

### During Protected Page Load

| Component | Endpoint | Method | Token | Issue |
|-----------|----------|--------|-------|-------|
| AppHeader | GCGC `/api/v1/users/me` | GET | Session | Should use TMS-Server |
| CenterPanel | TMS-Server `/api/v1/conversations` | GET | JWT | Correct |

### Session Validation

| Method | Endpoint | System | Token |
|--------|----------|--------|-------|
| authService.validateSession() | `/api/v1/users/me` | TMS-Server | JWT |
| authService.isAuthenticated() | None (localStorage check) | Local | N/A |

---

## 12. Complete Request/Response Examples

### Example 1: Login Request

```http
POST https://gcgc-team-management-system-staging.up.railway.app/api/auth/signin/credentials
Content-Type: application/x-www-form-urlencoded

email=user@example.com&password=SecurePass123&redirect=false&json=true
```

**Response:**
```http
HTTP/1.1 200 OK
Set-Cookie: next-auth.session-token=...
```

### Example 2: Get JWT Token

```http
GET https://gcgc-team-management-system-staging.up.railway.app/api/v1/auth/token
Cookie: next-auth.session-token=...
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoiamRvZUBleGFtcGxlLmNvbSIsImlhdCI6MTY5MDAwMDAwMCwiZXhwIjoxNjkwMDg2NDAwfQ.Zk8x..."
}
```

### Example 3: TMS-Server Login

```http
POST http://localhost:8000/api/v1/auth/login
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoiamRvZUBleGFtcGxlLmNvbSIsImlhdCI6MTY5MDAwMDAwMCwiZXhwIjoxNjkwMDg2NDAwfQ.Zk8x..."
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "tms_user_id": "user-123",
    "email": "jdoe@example.com",
    "username": "johndoe",
    "display_name": "John Doe",
    "first_name": "John",
    "last_name": "Doe",
    "role": "MEMBER",
    "image": null,
    "created_at": "2024-10-30T10:15:00Z"
  }
}
```

### Example 4: Get Messages with JWT

```http
GET http://localhost:8000/api/v1/messages?conversation_id=conv-123&limit=50
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoiamRvZUBleGFtcGxlLmNvbSIsImlhdCI6MTY5MDAwMDAwMCwiZXhwIjoxNjkwMDg2NDAwfQ.Zk8x...
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "msg-001",
      "conversation_id": "conv-123",
      "sender_id": "user-123",
      "content": "Hello world",
      "type": "TEXT",
      "created_at": "2024-10-30T10:20:00Z",
      "updated_at": "2024-10-30T10:20:00Z"
    }
  ]
}
```

---

## 13. Token Flow Visualization

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL STORAGE                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  auth_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."      │
│  tms_session_active: "true"                                 │
│  user_data: "{ id: ..., email: ..., name: ... }"            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
                 [Every API Request]
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    HTTP HEADERS                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 │
│  Content-Type: application/json                             │
│  Cookie: [session cookies if any]                           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
                [TMS-Server API]
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              SERVER VALIDATION                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Extract JWT from Authorization header                   │
│  2. Validate signature with JWT_SECRET                      │
│  3. Check expiration                                        │
│  4. Check user_id in token                                  │
│  5. Return 401 if invalid                                   │
│  6. Process request if valid                                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. Security Analysis

### Strengths ✅

1. **JWT Token-Based Auth** - Stateless, scalable
2. **External User Management** - GCGC handles user data
3. **Credential Not Stored** - Only JWT in localStorage
4. **Authorization Header** - Token not in URL/cookies
5. **HTTPS in Production** - Railway deployments use HTTPS

### Weaknesses ⚠️

1. **No Automatic Token Refresh** - User must re-login on expiration
2. **localStorage Used** - XSS can steal token
3. **No Token Rotation** - Same token for entire session
4. **Client-Side Route Guards** - Can be bypassed with dev tools
5. **GCGC Dependency** - If GCGC down, no login
6. **No Rate Limiting** - On login endpoint (frontend)
7. **Session Flag Separate from Token** - Could get out of sync
8. **No CSRF Protection** - POST requests vulnerable if on same domain

### Recommendations

1. Add `httpOnly` cookies for token storage (server-side rendering)
2. Implement token refresh endpoint
3. Add server-side middleware for route protection
4. Add rate limiting on auth endpoints
5. Implement token rotation on refresh
6. Add CSRF tokens for state-changing requests
7. Consider using NextAuth.js for integrated auth

---

## 15. Runtime API URL Detection

**File:** `/src/lib/runtimeConfig.ts`

```typescript
export const getApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000/api/v1';
    }

    // Railway deployment (staging)
    if (hostname.includes('railway.app')) {
      return 'https://tms-server-staging.up.railway.app/api/v1';
    }

    // Fallback
    return 'https://tms-server-staging.up.railway.app/api/v1';
  }

  return 'https://tms-server-staging.up.railway.app/api/v1';
};
```

**Why This Matters:**
- Avoids build-time environment variable issues
- Detects environment at runtime from hostname
- Works for Railway deployments without env var changes

**How It Works:**
1. Read current hostname from `window.location.hostname`
2. Match against known patterns:
   - `localhost` → local development
   - `railway.app` → Railway staging
   - Default → Staging
3. Cache result to avoid repeated detection

---

## 16. Storage Keys Reference

**File:** `/src/lib/constants.ts`

```typescript
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',      // JWT token from GCGC
  USER_DATA: 'user_data',        // Cached user object
  THEME: 'theme',                // Theme preference
  LANGUAGE: 'language',          // Language preference
} as const;
```

**Additional Keys (Not in STORAGE_KEYS):**
- `tms_session_active` - Session active flag (string 'true'/'false' or undefined)

---

## Summary of Key Findings

### Authentication Method
- **Type:** OAuth 2.0 with JWT bearer tokens
- **GCGC Role:** User identity provider (sign-in)
- **TMS-Server Role:** API authentication validator
- **Token Storage:** localStorage (auth_token)
- **Session Indicator:** localStorage (tms_session_active)

### Login Sequence
1. Credentials → GCGC (`/api/auth/signin/credentials`)
2. Get JWT → GCGC (`/api/v1/auth/token`)
3. Validate JWT → TMS-Server (`/api/v1/auth/login`)
4. Get User → TMS-Server (`/api/v1/users/me`)
5. Cache User → localStorage

### API Calls
- **GCGC calls:** During login, token refresh, signout
- **TMS-Server calls:** All app operations (conversations, messages)
- **Total endpoints:** 8+ GCGC, 20+ TMS-Server

### Protected Routes
- **Method:** Client-side checks in React components
- **Entry:** Root page (`/`) redirects based on auth state
- **Main:** `/chats` layout uses AppHeader for protection
- **Risk:** User briefly sees page before redirect

### Issues Found
1. AppHeader loads user from GCGC instead of TMS-Server
2. No automatic token refresh mechanism
3. No server-side middleware for route protection
4. Multiple inconsistent user fetching methods
5. Hard redirects on 401 instead of graceful handling

---

## Files Analyzed

**Authentication Files:**
- `/src/features/auth/services/authService.ts` - Main auth logic
- `/src/features/auth/hooks/useAuth.ts` - Auth hook
- `/src/store/authStore.ts` - Zustand auth store
- `/src/store/userStore.ts` - Zustand user store

**API/Config Files:**
- `/src/lib/apiClient.ts` - API request client
- `/src/lib/constants.ts` - Constants and storage keys
- `/src/lib/runtimeConfig.ts` - Runtime URL detection
- `/src/lib/tmsApi.ts` - GCGC API client

**Route/Layout Files:**
- `/src/app/page.tsx` - Root redirect logic
- `/src/app/(auth)/login/page.tsx` - Login form
- `/src/app/(main)/layout.tsx` - Protected layout
- `/src/components/layout/AppHeader.tsx` - Header with user load

**Service Files:**
- `/src/features/users/services/userService.ts` - User API calls
- `/src/features/conversations/services/conversationService.ts` - Conversation API
- `/src/features/messaging/services/messageService.ts` - Message API

**Environment:**
- `.env` - Frontend configuration
- `next.config.js` - Next.js configuration
- `CLAUDE.md` - Project documentation

---

**Analysis Complete**  
**Total Files Reviewed:** 20+  
**Total Endpoints Found:** 25+  
**Issues Identified:** 8  

