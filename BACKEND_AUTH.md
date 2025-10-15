# Backend Authentication Requirements

## 🔥 IMMEDIATE FIX NEEDED

**Current Error**: `Failed to fetch current user: /auth/signin?callbackUrl=%2Fapi%2Fv1%2Fusers%2Fme`

**The Problem**: Backend is calling TMS without authentication (cookies don't work cross-domain).

**The Fix** (one line change):

```python
# ❌ CURRENT CODE (BROKEN):
response = await client.get(f"{TMS_API_URL}/api/v1/users/me")

# ✅ FIXED CODE:
response = await client.get(
    f"{TMS_API_URL}/api/v1/users/me",
    headers={"Authorization": f"Bearer {token}"}  # Use token from frontend!
)
```

**Where to change**: In your `/api/v1/auth/login` endpoint, use the `token` from the request body as a Bearer token.

**Full implementation below** ↓

---

## Current Issue

The frontend authenticates with TMS (Team Management System) using **session-based authentication** (NextAuth cookies), but the backend's `/api/v1/auth/login` endpoint expects a **JWT token** in the request body.

This causes a mismatch where:
- Frontend has valid TMS session ✅
- Frontend can access TMS APIs ✅
- Backend rejects requests with "Missing authorization header" ❌

---

## Recommended Solution

Update the backend `/api/v1/auth/login` endpoint to support **two authentication methods**:

### Method 1: JWT Token (Current - Keep for backward compatibility)
```json
POST /api/v1/auth/login
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Method 2: Session Cookie Validation (New - Recommended)
```json
POST /api/v1/auth/login
{
  "token": "session-based-auth",
  "user_id": "user-123",
  "email": "user@example.com"
}
Headers: Cookie: next-auth.session-token=abc123...
```

---

## 🚨 CRITICAL: Cross-Domain Cookie Issue

**Current Error**:
```json
{"detail":"Failed to fetch current user: /auth/signin?callbackUrl=%2Fapi%2Fv1%2Fusers%2Fme"}
```

**Why This Happens**:

```
Frontend Domain:  tms-client-staging.up.railway.app
    ↓ (sends session cookie for gcgc-team-management...)
    ↓
TMS Domain:       gcgc-team-management-system-staging.up.railway.app (sets session cookie)
    ↓
Backend Domain:   tms-server-staging.up.railway.app
    ↓ (tries to call TMS but has NO session cookie!)
    ↓
TMS:             "No auth → Redirect to /auth/signin" ❌
```

**Session cookies are domain-specific!** The backend can't use the TMS session cookies because they belong to a different domain.

**The Fix**: Backend must use the **session token as a Bearer token** when calling TMS.

---

## Backend Implementation (Python/FastAPI)

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import httpx

router = APIRouter()

class LoginRequest(BaseModel):
    token: str
    user_id: str | None = None
    email: str | None = None

class LoginResponse(BaseModel):
    success: bool
    user: dict

@router.post("/auth/login", response_model=LoginResponse)
async def login(request: Request, data: LoginRequest):
    """
    Authenticate user via TMS.

    Supports session token validation using NextAuth session tokens
    sent from the frontend.
    """

    # Validate using token as Bearer auth
    if data.token and data.token != "session-based-auth":
        # Real session token from frontend - use as Bearer token
        return await validate_session_token(
            data.token, data.user_id, data.email
        )

    # Fallback: No token extracted from cookies
    if data.token == "session-based-auth":
        raise HTTPException(
            status_code=401,
            detail="Session token required. Frontend couldn't extract token from cookies."
        )

    raise HTTPException(status_code=401, detail="Missing token")


async def validate_jwt_token(token: str) -> LoginResponse:
    """Existing JWT token validation logic"""
    # Your existing implementation
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMS_API_URL}/api/v1/users/me",
            headers={"Authorization": f"Bearer {token}"}
        )

        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_data = response.json()
        # Sync user to database
        await sync_user_to_db(user_data)

        return LoginResponse(success=True, user=user_data)


async def validate_session_token(
    token: str,
    user_id: str | None = None,
    email: str | None = None
) -> LoginResponse:
    """
    Validate NextAuth session token with TMS.

    CRITICAL FIX for cross-domain issue:
    - Cookies don't work across different domains
    - Frontend: tms-client-staging.up.railway.app
    - TMS: gcgc-team-management-system-staging.up.railway.app
    - Backend: tms-server-staging.up.railway.app

    Solution: Use the session token as a Bearer token for TMS API calls
    """

    # Call TMS /api/v1/users/me with session token as Bearer auth
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMS_API_URL}/api/v1/users/me",
            headers={"Authorization": f"Bearer {token}"}  # ← KEY FIX: Use token!
        )

        if response.status_code != 200:
            error_text = response.text
            raise HTTPException(
                status_code=401,
                detail=f"TMS validation failed: {error_text}"
            )

        user_data = response.json()

        # Optional: Verify user_id matches if provided
        if user_id and user_data.get("id") != user_id:
            raise HTTPException(
                status_code=401,
                detail="User ID mismatch - token may be for different user"
            )

        # Sync user to local database
        await sync_user_to_db(user_data)

        # Optional: Create backend session or return backend-specific token
        # backend_token = create_backend_session(user_data)

        return LoginResponse(success=True, user=user_data)


async def sync_user_to_db(user_data: dict):
    """Sync TMS user data to local database"""
    # Your existing user sync logic
    pass
```

---

## CORS Configuration

Ensure the backend allows credentials from the frontend:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://tms-client-staging.up.railway.app",
        "http://localhost:3000"
    ],
    allow_credentials=True,  # ← CRITICAL for cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Alternative: Create New Endpoint

If modifying `/api/v1/auth/login` is too risky, create a new endpoint:

```python
@router.post("/auth/session-login")
async def session_login(request: Request):
    """
    Authenticate using TMS session cookies (NextAuth)
    """
    cookies = request.cookies

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMS_API_URL}/api/v1/users/me",
            cookies=cookies
        )

        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")

        user_data = response.json()
        await sync_user_to_db(user_data)

        return {"success": True, "user": user_data}
```

Then update frontend to call this endpoint instead:
```typescript
const response = await fetch(`${API_URL}/auth/session-login`, {
  method: 'POST',
  credentials: 'include'
});
```

---

## Testing

### Test Session Validation
```bash
# 1. Login to TMS via frontend to get session cookie

# 2. Copy cookie value from browser DevTools (Application > Cookies)

# 3. Test backend endpoint
curl -X POST https://tms-server-staging.up.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN_HERE" \
  -d '{
    "token": "session-based-auth",
    "user_id": "USER_ID",
    "email": "user@example.com"
  }'
```

---

## Security Considerations

1. **SameSite Cookie Attribute**: Ensure TMS sets cookies with appropriate SameSite attribute
2. **HTTPS Only**: Use `Secure` flag on cookies in production
3. **Session Expiry**: Validate session hasn't expired
4. **CSRF Protection**: Consider CSRF tokens for state-changing operations
5. **Rate Limiting**: Implement rate limiting on auth endpoints

---

## Migration Path

### Phase 1 (Current): Frontend Workaround
- Frontend extracts NextAuth session token from cookies
- Sends token in request body
- Backend validates with TMS

### Phase 2 (Recommended): Backend Update
- Backend supports both JWT and session cookie validation
- Gradual migration of clients

### Phase 3 (Future): Full Session-Based
- All clients use session cookies
- Deprecate JWT token method

---

## Questions for Backend Team

1. ✅ Does the backend have access to TMS API (`https://gcgc-team-management-system-staging.up.railway.app`)?
2. ✅ Can the backend make HTTPS requests with cookie forwarding?
3. ⚠️ Is there rate limiting on TMS `/api/v1/users/me` endpoint?
4. ⚠️ Should the backend create its own session after validating TMS session?
5. ⚠️ What's the preferred session storage mechanism (Redis, database, JWT)?

---

## Contact

For questions or clarification on frontend implementation, refer to:
- `src/features/auth/services/authService.ts` - Authentication service
- `src/lib/apiClient.ts` - API client with auth headers
- This document: `BACKEND_AUTH.md`
