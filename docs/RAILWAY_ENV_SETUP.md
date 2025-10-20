# Railway Environment Variables Setup

## Critical: Missing Environment Variable Fix

Your deployment failed because the **Client ENV** is missing `NEXT_PUBLIC_API_URL`, causing `undefined/auth/login` errors.

---

## Required Railway Environment Variables

### **Client Service** (tms-client-staging)

Add this missing variable to your Railway client service:

```bash
# TMS API Configuration (GCGC Team Management System)
NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL=https://gcgc-team-management-system-staging.up.railway.app

# Backend API Configuration (TMS Server - FastAPI)
# ⚠️ CRITICAL: This was MISSING - add it now!
NEXT_PUBLIC_API_URL=https://tms-server-staging.up.railway.app/api/v1

# WebSocket Configuration
NEXT_PUBLIC_WS_URL=wss://tms-server-staging.up.railway.app

# Cloudinary Configuration
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dvjptzyhg
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-upload-preset

# Environment
NEXT_PUBLIC_ENVIRONMENT=staging
```

### **Server Service** (tms-server-staging)

Your server variables are correct, but verify these are set:

```bash
ENVIRONMENT=staging
DEBUG=true
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_URL_SYNC=${{Postgres.DATABASE_URL}}
USER_MANAGEMENT_API_URL=https://gcgc-team-management-system-staging.up.railway.app
USER_MANAGEMENT_API_KEY=REDACTED_API_KEY
USER_MANAGEMENT_API_TIMEOUT=30
ALLOWED_ORIGINS=https://tms-client-staging.up.railway.app
JWT_SECRET=REDACTED_SECRET
NEXTAUTH_SECRET=REDACTED_SECRET
```

---

## How to Add the Missing Variable in Railway

1. **Go to Railway Dashboard**: https://railway.app
2. **Select your project**: `tms-client-staging`
3. **Click "Variables" tab**
4. **Add new variable**:
   - Name: `NEXT_PUBLIC_API_URL`
   - Value: `https://tms-server-staging.up.railway.app/api/v1`
5. **Click "Deploy"** to redeploy with the new variable

---

## What Was Fixed in the Code

The code has been updated with **3 critical fixes**:

### 1. **constants.ts** - Runtime HTTPS Enforcement
- Added intelligent detection for Railway deployments
- Automatically forces HTTPS for `railway.app` domains
- Provides fallback even when env var is missing

### 2. **authService.ts** - Fixed Backend Authentication
- Changed from `process.env.NEXT_PUBLIC_API_URL` (which was undefined) to `getApiBaseUrl()`
- Now correctly calls `https://tms-server-staging.up.railway.app/auth/login`

### 3. **userService.ts** - Centralized API Client
- Replaced raw `fetch()` calls with `apiClient.get()`
- Ensures consistent HTTPS usage across all API calls
- Automatically includes authentication headers

---

## Verification Checklist

After adding the environment variable and redeploying:

- [ ] No more "Mixed Content" errors in browser console
- [ ] No more `undefined/auth/login` errors
- [ ] User search works correctly
- [ ] Authentication with backend succeeds
- [ ] WebSocket connection establishes (wss://)

---

## Testing Steps

1. **Add the missing env var** in Railway dashboard
2. **Redeploy** the client service
3. **Open** https://tms-client-staging.up.railway.app
4. **Login** with your TMS credentials
5. **Try to start a chat** - search for users
6. **Check browser console** - should see:
   - ✅ JWT token obtained from TMS
   - ✅ Backend authentication successful
   - No mixed content errors
   - No undefined URL errors

---

## Fallback Behavior (Even Without Env Var)

The code now has **intelligent fallbacks** so even if you forget the env var:

- **Railway deployments**: Automatically uses `https://tms-server-staging.up.railway.app/api/v1`
- **Local development**: Uses `http://localhost:8000/api/v1`
- **HTTPS enforcement**: All Railway URLs are forced to HTTPS

This means your deployment should work now, but **it's still best practice** to set the env var explicitly in Railway.

---

## For Production Deployment

When moving to production:

```bash
# Client
NEXT_PUBLIC_API_URL=https://tms-server-production.up.railway.app/api/v1
NEXT_PUBLIC_WS_URL=wss://tms-server-production.up.railway.app
NEXT_PUBLIC_ENVIRONMENT=production

# Server
ALLOWED_ORIGINS=https://tms-client-production.up.railway.app
ENVIRONMENT=production
DEBUG=false
```

---

## Common Issues & Solutions

### Issue: Still seeing `http://` instead of `https://`
**Solution**: Clear browser cache and hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)

### Issue: WebSocket not connecting
**Solution**: Verify `NEXT_PUBLIC_WS_URL` uses `wss://` (not `ws://`)

### Issue: CORS errors
**Solution**: Ensure server's `ALLOWED_ORIGINS` includes client URL

### Issue: 404 on `/auth/login`
**Solution**: Check FastAPI server has `/auth/login` endpoint implemented

---

## Questions?

If issues persist after:
1. Adding the missing `NEXT_PUBLIC_API_URL` variable
2. Redeploying the client
3. Clearing browser cache

Check the Railway deployment logs for both services.
