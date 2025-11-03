# TMS-Client Authentication - Quick Reference Guide

## 1. Authentication Flow At-A-Glance

```
User Login → GCGC Signin → Get JWT → TMS-Server Validate → Redirect /chats
```

**4 Key Steps:**
1. POST `/api/auth/signin/credentials` to GCGC
2. GET `/api/v1/auth/token` from GCGC (get JWT)
3. POST `/api/v1/auth/login` to TMS-Server (validate JWT)
4. GET `/api/v1/users/me` from TMS-Server (get user data)

## 2. File Locations

| Purpose | File |
|---------|------|
| Auth Service Logic | `/src/features/auth/services/authService.ts` |
| Auth Store (Zustand) | `/src/store/authStore.ts` |
| Auth Hook | `/src/features/auth/hooks/useAuth.ts` |
| User Service | `/src/features/users/services/userService.ts` |
| API Client | `/src/lib/apiClient.ts` |
| Runtime Config | `/src/lib/runtimeConfig.ts` |
| Login Page | `/src/app/(auth)/login/page.tsx` |
| Root Redirect | `/src/app/page.tsx` |
| App Header (Protection) | `/src/components/layout/AppHeader.tsx` |

## 3. Key Environment Variables

```bash
# Team Management System (User Identity)
NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL=https://gcgc-team-management-system-staging.up.railway.app

# Team Messaging System (Application)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# Runtime detection (automatic based on hostname)
# - localhost → http://localhost:8000/api/v1
# - railway.app → https://tms-server-staging.up.railway.app/api/v1
```

## 4. Storage Keys

| Key | Value | Used For |
|-----|-------|----------|
| `auth_token` | JWT string | All API requests |
| `tms_session_active` | 'true' or undefined | Session indicator |
| `user_data` | User object JSON | Cached user |

## 5. GCGC Endpoints (External)

| Endpoint | Method | When | Token |
|----------|--------|------|-------|
| `/api/auth/signin/credentials` | POST | Login | Session |
| `/api/v1/auth/token` | GET | After signin | Session |
| `/api/auth/signout` | POST | Logout | Session |
| `/api/v1/users/search` | GET | Search users | Session |
| `/api/v1/users/me` | GET | AppHeader (BUG!) | Session |

**Base URL:** `NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL`

## 6. TMS-Server Endpoints (Internal)

| Endpoint | Method | Purpose | Token |
|----------|--------|---------|-------|
| `/api/v1/auth/login` | POST | Validate JWT | JWT |
| `/api/v1/users/me` | GET | Get user data | JWT |
| `/api/v1/conversations` | GET | List conversations | JWT |
| `/api/v1/messages` | GET/POST | Messages | JWT |
| `/socket.io` | WS | Real-time | JWT |

**Base URL:** Runtime-detected by `getApiBaseUrl()`

## 7. Authentication Classes & Methods

### authService (Singleton)

```typescript
// Login flow
authService.login(credentials)        // Step 1-4: Full login
authService.logout()                  // Clear session
authService.getCurrentUser()          // Get user (TMS-Server)
authService.validateSession()         // Check if valid
authService.isAuthenticated()         // Check localStorage
authService.setSessionActive(bool)    // Set session flag
```

### useAuthStore (Zustand)

```typescript
const { 
  login,           // Async: call authService.login()
  logout,          // Sync: call authService.logout()
  checkAuth,       // Async: validate session
  isAuthenticated, // Boolean
  isLoading,       // Boolean
  error,           // String | null
  token,           // 'session-active' or null
} = useAuthStore();
```

### useAuth Hook

```typescript
const {
  login,           // Async (credentials) => void
  logout,          // () => void
  checkAuth,       // () => Promise<void>
  isAuthenticated, // Boolean
  isLoading,       // Boolean
  error,           // String | null
  user,            // User | null (from userStore)
  clearError,      // () => void
} = useAuth(autoCheck?: boolean);  // Default: true
```

## 8. JWT Token Details

**Storage:** localStorage  
**Key:** `auth_token`  
**Expiration:** Set by GCGC (check JWT payload)  
**Refresh:** No automatic refresh - user must re-login  
**Format:** Bearer token in `Authorization: Bearer {token}` header  

**Decoded Example:**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "iat": 1651234567,
  "exp": 1651321000
}
```

## 9. Route Protection

| Route | Protection | How |
|-------|-----------|-----|
| `/` | Redirect logic | checkAuth() → /chats or /login |
| `/login` | Public | No auth required |
| `/chats` | Client-side | AppHeader checks GCGC |
| `/chats/[id]` | Client-side | No explicit check |

**Issue:** No server-side middleware - user briefly sees page before redirect.

## 10. Common Operations

### Login User
```typescript
const { login } = useAuth();
await login({ email: 'user@example.com', password: 'password' });
// Flow: authService.login() → Zustand → fetch user → redirect
```

### Logout User
```typescript
const { logout } = useAuth();
logout();
// Clears: localStorage, session flag, auth store
```

### Check Auth on Load
```typescript
useEffect(() => {
  checkAuth(); // Calls authService.validateSession()
}, []);
```

### Make Authenticated Request
```typescript
const response = await apiClient.get('/conversations');
// Automatically includes: Authorization: Bearer {JWT}
```

## 11. Known Issues

| # | Issue | Location | Severity | Fix |
|---|-------|----------|----------|-----|
| 1 | AppHeader loads from GCGC | `/components/layout/AppHeader.tsx` | Medium | Use TMS-Server endpoint |
| 2 | User endpoint inconsistency | `/features/users/services/` | Low | Use `getApiBaseUrl()` |
| 3 | No route middleware | N/A | High | Add `middleware.ts` |
| 4 | No token refresh | `authService.ts` | Medium | Implement refresh |
| 5 | Hard redirect on 401 | `AppHeader.tsx` | Low | Use `router.push()` |
| 6 | Multiple user fetch methods | Various | Low | Single source of truth |

## 12. Session Validation Flow

```
Page Load
  ↓
checkAuth()
  ↓
[1] Check localStorage['tms_session_active']
  ↓ (if false → return not authenticated)
[2] Check localStorage['auth_token']
  ↓ (if null → return not authenticated)
[3] GET /api/v1/users/me with JWT
  ↓
[4] If 200 → Valid (set authenticated: true)
[5] If 401/error → Invalid (logout, clear token)
```

## 13. Token Lifecycle

```
[Login]
  ↓ (POST /api/auth/signin/credentials)
[GCGC Session]
  ↓ (GET /api/v1/auth/token)
[JWT Token]
  ↓ (store in localStorage)
[Every Request]
  ↓ (Authorization: Bearer {JWT})
[Token Expires?]
  ↓ (No refresh → user sees 401)
[Logout]
  ↓ (POST /api/auth/signout + clear localStorage)
[Session Cleared]
```

## 14. API Request Example

**Making a protected request:**

```typescript
// apiClient automatically adds Authorization header
const conversations = await apiClient.get('/conversations');

// Behind the scenes:
// 1. Get token: localStorage.getItem('auth_token')
// 2. Add header: Authorization: Bearer {token}
// 3. Send request: GET https://tms-server/api/v1/conversations
// 4. Server validates JWT signature
// 5. Return data if valid, 401 if invalid
```

## 15. Debugging Tips

**Check token in console:**
```javascript
localStorage.getItem('auth_token')
localStorage.getItem('tms_session_active')
```

**Check auth state:**
```javascript
// In browser console (requires Zustand devtools)
useAuthStore.getState()
useUserStore.getState()
```

**Monitor API calls:**
- Check Network tab in DevTools
- Look for `Authorization` header
- Check for CORS errors
- Verify JWT format

**Enable debug logging:**
- Check browser console for `[API Client]` logs
- Check for `[Runtime Config]` logs
- Check for auth errors

## 16. Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| CORS error | GCGC denies request | Not in ALLOWED_ORIGINS |
| 401 Unauthorized | Invalid/expired JWT | Login again |
| "No JWT token" | GCGC auth failed | Check GCGC is accessible |
| User not loaded | Network error | Check API URL |
| Token missing | localStorage cleared | Login again |
| Infinite redirect loop | Auth check recursion | Check checkAuth logic |

## 17. Files to Modify for Fixes

| Fix | File | Lines |
|-----|------|-------|
| AppHeader GCGC issue | `/src/components/layout/AppHeader.tsx` | 30-60 |
| User endpoint | `/src/features/users/services/userService.ts` | 35 |
| Route protection | Create `src/middleware.ts` | New |
| Token refresh | `/src/features/auth/services/authService.ts` | New method |

---

**Quick Link to Full Analysis:** See `AUTH_FLOW_ANALYSIS.md`
