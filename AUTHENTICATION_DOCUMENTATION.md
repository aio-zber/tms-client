# TMS-Client Authentication Documentation Index

This folder contains comprehensive documentation of the TMS-Client authentication system.

## Documents Overview

### 1. AUTH_FLOW_ANALYSIS.md (Main Document)
**Size:** 1,309 lines | **Type:** Comprehensive Deep Dive

Complete technical analysis of the authentication system with:
- Executive summary of the two-tier auth system
- Detailed architecture overview (system components, authentication methods)
- Complete step-by-step login flow (7 phases)
- JWT token management (acquisition, storage, validation, refresh, revocation)
- Session validation procedures
- All API endpoints (GCGC and TMS-Server)
- Token usage in requests
- Protected route implementation
- GCGC API calls
- TMS-Server API calls
- 8 issues found with details
- Endpoint call summaries
- Request/response examples with actual payloads
- Token flow visualization
- Security analysis (strengths, weaknesses, recommendations)
- Runtime API URL detection
- Complete token lifecycle diagram

**Best For:** Understanding the entire authentication system in detail

### 2. AUTH_QUICK_REFERENCE.md (Quick Lookup)
**Size:** 400+ lines | **Type:** Developer Quick Reference

Quick reference guide containing:
- Authentication flow at-a-glance
- Critical file locations
- Key environment variables
- Storage keys reference
- GCGC endpoints table
- TMS-Server endpoints table
- Authentication classes and methods
- JWT token details
- Route protection overview
- Common operations (login, logout, auth check, API requests)
- Known issues with severity levels
- Session validation flow diagram
- Token lifecycle diagram
- API request example with explanation
- Debugging tips and console commands
- Common errors and solutions
- Files to modify for fixes

**Best For:** Quick lookups during development, debugging, and implementation

### 3. AUTH_FIX_SUMMARY.md (Recent Changes)
**Size:** 300 lines | **Type:** Change Log & Status

Documents recent authentication fixes including:
- CORS error fix details
- Files modified and reasons
- Before/after code comparisons
- Verified working components
- Testing checklist
- Success indicators and error indicators
- Summary of changes table

**Best For:** Understanding recent changes and current status

### 4. CLAUDE.md (Project Guidelines)
**Size:** 450 lines | **Type:** Project Standards & Best Practices

Contains:
- Project overview and architecture
- Development commands (backend, frontend, testing)
- Architecture patterns and file organization
- Viber UI/UX design specifications
- Testing requirements
- Common patterns and best practices
- Environment configuration
- Database schema
- Security best practices
- Troubleshooting guide
- References and resources

**Best For:** Understanding project-wide standards and practices

## Quick Navigation by Task

### I want to understand...

**The complete authentication flow**
→ Read: AUTH_FLOW_ANALYSIS.md, Section 2 (Complete Login Flow)

**How to implement authentication**
→ Read: AUTH_QUICK_REFERENCE.md, Section 10 (Common Operations)

**What endpoints are called**
→ Read: AUTH_FLOW_ANALYSIS.md, Section 5 (API Endpoints)

**How tokens are managed**
→ Read: AUTH_FLOW_ANALYSIS.md, Section 3 (JWT Token Management)

**How session validation works**
→ Read: AUTH_FLOW_ANALYSIS.md, Section 4 (Session Validation)

**Protected route implementation**
→ Read: AUTH_FLOW_ANALYSIS.md, Section 7 (Protected Route Implementation)

**Issues and how to fix them**
→ Read: AUTH_QUICK_REFERENCE.md, Section 11 (Known Issues)

**How to debug authentication**
→ Read: AUTH_QUICK_REFERENCE.md, Section 15 (Debugging Tips)

**Common errors and solutions**
→ Read: AUTH_QUICK_REFERENCE.md, Section 16 (Common Errors & Solutions)

**Recent changes to authentication**
→ Read: AUTH_FIX_SUMMARY.md (Change Log)

**Request/response examples**
→ Read: AUTH_FLOW_ANALYSIS.md, Section 12 (Request/Response Examples)

**Security analysis**
→ Read: AUTH_FLOW_ANALYSIS.md, Section 14 (Security Analysis)

## Critical Files Referenced

### Authentication Core
- `/src/features/auth/services/authService.ts` - Main auth logic
- `/src/store/authStore.ts` - Zustand auth store
- `/src/features/auth/hooks/useAuth.ts` - Auth hook

### API & Config
- `/src/lib/apiClient.ts` - HTTP client with auth headers
- `/src/lib/runtimeConfig.ts` - Runtime URL detection
- `/src/lib/constants.ts` - Constants and storage keys

### Routes & Layout
- `/src/app/page.tsx` - Root redirect logic
- `/src/app/(auth)/login/page.tsx` - Login form
- `/src/components/layout/AppHeader.tsx` - Route protection (ISSUE #1)

### User Management
- `/src/features/users/services/userService.ts` - User data
- `/src/store/userStore.ts` - User state

## Key Concepts

### Two-Tier Authentication
1. **GCGC (External):** User identity provider (OAuth/NextAuth)
2. **TMS-Server (Internal):** Application-level authorization

### Authentication Flow
User Credentials → GCGC Signin → Get JWT → TMS-Server Validate → Protected Resources

### Token Storage
- **Key:** `auth_token`
- **Value:** JWT string
- **Location:** localStorage
- **Used in:** `Authorization: Bearer {token}` header

### Session Indicator
- **Key:** `tms_session_active`
- **Value:** 'true' or undefined
- **Location:** localStorage
- **Purpose:** Track if session is active

## Known Issues Summary

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| 1 | AppHeader loads from GCGC | MEDIUM | AppHeader.tsx:30-60 |
| 2 | Endpoint inconsistency | LOW | userService.ts:35 |
| 3 | No route middleware | HIGH | (missing file) |
| 4 | No token refresh | MEDIUM | authService.ts |
| 5 | Hard redirect on 401 | LOW | AppHeader.tsx |
| 6 | Multiple user fetch | LOW | Various |
| 7 | No error boundary | LOW | AppHeader.tsx |
| 8 | useAuth autoCheck | LOW | useAuth.ts |

**For details:** See AUTH_QUICK_REFERENCE.md, Section 11

## Environment Variables

```bash
# GCGC Team Management System
NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL=https://gcgc-...

# TMS-Server (detected at runtime)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# WebSocket
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# Environment
NEXT_PUBLIC_ENVIRONMENT=development
```

**Runtime detection logic:**
- `localhost` → local development
- `railway.app` → Railway staging
- Default → staging URL

## Storage Keys Reference

| Key | Value Type | Purpose |
|-----|-----------|---------|
| `auth_token` | JWT string | API authentication |
| `tms_session_active` | 'true' \| undefined | Session indicator |
| `user_data` | User JSON | Cached user |
| `theme` | 'light' \| 'dark' \| 'system' | UI theme |
| `language` | string | Language preference |

## Debugging Checklist

```javascript
// Check stored token
localStorage.getItem('auth_token')

// Check session flag
localStorage.getItem('tms_session_active')

// Check auth state
useAuthStore.getState()

// Check user state
useUserStore.getState()
```

**Network tab checks:**
- Look for `Authorization` header with Bearer token
- Check for CORS errors
- Verify JWT format in Authorization header
- Check for 401 responses (token expired)

## Testing the Authentication

1. Open browser DevTools
2. Go to Network tab
3. Login with test credentials
4. Observe:
   - POST to GCGC `/api/auth/signin/credentials`
   - GET to GCGC `/api/v1/auth/token`
   - POST to TMS-Server `/api/v1/auth/login`
   - GET to TMS-Server `/api/v1/users/me`
5. Check localStorage for `auth_token` and `tms_session_active`
6. Check subsequent requests have `Authorization` header

## Common Errors & Quick Fixes

| Error | Likely Cause | Quick Fix |
|-------|--------------|-----------|
| CORS error | GCGC blocking | Check ALLOWED_ORIGINS |
| 401 Unauthorized | Expired token | Login again |
| "No JWT token" | GCGC auth failed | Check GCGC accessibility |
| User not loaded | Network error | Check API URL |
| Token missing | localStorage cleared | Login again |
| Redirect loop | Auth recursion | Check checkAuth |

## Recommendations for Next Steps

### High Priority
1. Add server-side middleware for route protection (Issue #3)
2. Fix AppHeader to use TMS-Server endpoint (Issue #1)

### Medium Priority
3. Implement token refresh mechanism (Issue #4)
4. Use consistent user fetch method (Issue #6)

### Low Priority
5. Fix hard redirect to use router.push() (Issue #5)
6. Add error boundary for auth failures (Issue #7)
7. Better deduplication in useAuth (Issue #8)

### Security Improvements
8. Store JWT in httpOnly cookie
9. Add CSRF protection
10. Add rate limiting on auth endpoints
11. Implement token rotation

## Related Documentation

- **Project Guidelines:** See `CLAUDE.md`
- **API Implementation:** See `FRONTEND_IMPLEMENTATION_GUIDE.md`
- **WebSocket Integration:** See `WEBSOCKET_INTEGRATION_COMPLETE.md`
- **Deployment Status:** See `DEPLOYMENT_STATUS.md`

## Support & Questions

For issues with authentication:
1. Check appropriate section in AUTH_QUICK_REFERENCE.md
2. Review examples in AUTH_FLOW_ANALYSIS.md
3. Check Network tab in DevTools
4. Check browser console for error messages
5. Verify all environment variables are set

## Document Versions

- **AUTH_FLOW_ANALYSIS.md:** Latest (comprehensive)
- **AUTH_QUICK_REFERENCE.md:** Latest (quick lookup)
- **AUTH_FIX_SUMMARY.md:** October 30, 2025 (change log)
- **CLAUDE.md:** Latest (project standards)

---

**Last Updated:** 2025-11-03  
**Analysis Completeness:** Very Thorough (all files reviewed)  
**Status:** Ready for use  
