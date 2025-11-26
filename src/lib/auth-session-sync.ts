/**
 * Session Synchronization Module
 *
 * Handles session validation and synchronization between GCGC and TMS-Client.
 * Detects when users log out or switch accounts in GCGC and clears TMS session.
 *
 * Features:
 * - Window focus validation (immediate detection when switching tabs)
 * - Periodic polling (background validation every 60s)
 * - Multi-tab sync (localStorage events)
 * - Rate limiting (max 1 validation per 5s)
 * - Network error resilience (doesn't logout on transient failures)
 */

import { useEffect, useRef } from 'react';
import { log } from '@/lib/logger';

const TMS_SERVER_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
                       'https://tms-server-staging.up.railway.app';
const GCGC_URL = process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL ||
                 'https://gcgc-team-management-system-staging.up.railway.app';
const TMS_CLIENT_URL = process.env.NEXT_PUBLIC_TMS_CLIENT_URL ||
                       'https://tms-client-staging.up.railway.app';

const VALIDATION_INTERVAL = 60000; // 60 seconds
const RATE_LIMIT_WINDOW = 5000; // 5 seconds
const DEBUG = process.env.NODE_ENV === 'development';

interface SessionValidationResponse {
  valid: boolean;
  user?: {
    tms_user_id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  message?: string;
}

interface SessionEvent {
  type: 'LOGOUT' | 'USER_CHANGED' | 'LOGIN';
  timestamp: number;
  userId?: string;
}

export function useSessionSync() {
  const validationInProgress = useRef(false);
  const lastValidation = useRef(0);
  const intervalId = useRef<NodeJS.Timeout>();
  const mountTime = useRef<number>(0);

  /**
   * Validate session with TMS-Server
   * Returns true if session is valid, false if invalid
   */
  const validateSession = async (): Promise<boolean> => {
    // Skip if not in browser
    if (typeof window === 'undefined') {
      return true;
    }

    // Skip validation during SSO initialization to prevent race conditions
    const token = localStorage.getItem('auth_token');
    const url = new URL(window.location.href);
    const hasSsoCode = url.searchParams.has('sso_code') || url.searchParams.has('gcgc_token');
    const isRootPage = window.location.pathname === '/';
    const isCallbackPage = window.location.pathname === '/auth/callback';

    // Don't validate during SSO flow - let page.tsx handle authentication
    if (!token || hasSsoCode || isCallbackPage || (isRootPage && !token)) {
      if (DEBUG) log.auth.info('[Session Sync] Skipping validation during SSO flow');
      return true; // Return true to prevent logout during SSO
    }

    // Prevent concurrent validations
    if (validationInProgress.current) {
      if (DEBUG) log.auth.info('[Session Sync] Validation already in progress, skipping');
      return true;
    }

    // Rate limiting: Don't validate more than once per 5 seconds
    const now = Date.now();
    if (now - lastValidation.current < RATE_LIMIT_WINDOW) {
      if (DEBUG) log.auth.info('[Session Sync] Rate limit: skipping validation');
      return true;
    }

    // Cross-tab validation coordination: Check if another tab validated recently
    const lastGlobalValidation = localStorage.getItem('last_validation_timestamp');
    if (lastGlobalValidation && now - parseInt(lastGlobalValidation) < RATE_LIMIT_WINDOW) {
      if (DEBUG) log.auth.info('[Session Sync] Another tab validated recently, skipping');
      return true;
    }

    const currentUserId = localStorage.getItem('current_user_id');

    try {
      validationInProgress.current = true;
      lastValidation.current = now;

      // Update global validation timestamp for cross-tab coordination
      localStorage.setItem('last_validation_timestamp', now.toString());

      const startTime = Date.now();
      if (DEBUG) log.auth.info('[Session Sync] Validating session...');

      const response = await fetch(`${TMS_SERVER_URL}/api/v1/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const latency = Date.now() - startTime;

      if (response.status === 401) {
        log.auth.info('[Session Sync] Token invalid (401) - clearing session');
        clearSession('invalid_token');
        return false;
      }

      if (!response.ok) {
        log.auth.warn(`[Session Sync] Validation failed with status ${response.status}`);
        // Don't logout on server errors - might be temporary
        return true;
      }

      const data: SessionValidationResponse = await response.json();

      if (!data.valid) {
        log.auth.info('[Session Sync] Session invalid - clearing session');
        clearSession('invalid_token');
        return false;
      }

      // Check if user changed - only if current_user_id was already set
      if (currentUserId && data.user?.tms_user_id && data.user.tms_user_id !== currentUserId) {
        log.auth.info('[Session Sync] User changed - clearing session', {
          oldUserId: currentUserId,
          newUserId: data.user.tms_user_id,
        });
        clearSession('user_mismatch');
        return false;
      }

      // Initialize user ID if not set yet (prevents false mismatch on first validation)
      if (!currentUserId && data.user?.tms_user_id) {
        localStorage.setItem('current_user_id', data.user.tms_user_id);
        if (DEBUG) {
          log.auth.info('[Session Sync] Initialized stored user ID:', data.user.tms_user_id);
        }
      }

      if (DEBUG) {
        log.auth.info('[Session Sync] Session valid', {
          userId: data.user?.tms_user_id,
          latency: `${latency}ms`,
        });
      }

      return true;
    } catch (error) {
      log.auth.error('[Session Sync] Validation error:', error);
      // Don't logout on network errors - might be temporary connection issue
      return true;
    } finally {
      validationInProgress.current = false;
    }
  };

  /**
   * Clear local session and redirect to SSO
   * @param reason - Why the session is being cleared
   */
  const clearSession = (reason?: 'invalid_token' | 'user_mismatch' | 'logout') => {
    if (typeof window === 'undefined') return;

    log.auth.info('[Session Sync] Clearing local session', { reason });

    const oldUserId = localStorage.getItem('current_user_id');

    // Clear all auth-related data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user_id');
    localStorage.removeItem('tms_session_active');

    // Don't redirect during SSO flow - let page.tsx handle it
    const url = new URL(window.location.href);
    const hasSsoCode = url.searchParams.has('sso_code') || url.searchParams.has('gcgc_token');
    const isCallbackPage = window.location.pathname === '/auth/callback';

    if (hasSsoCode || isCallbackPage) {
      log.auth.info('[Session Sync] SSO flow detected, not redirecting (page will handle it)');
      return; // Let the main page flow handle redirect
    }

    // For invalid token or user mismatch: trigger automatic re-authentication
    if (reason === 'invalid_token' || reason === 'user_mismatch') {
      // Set flags for loading state
      localStorage.setItem('reauthenticating', 'true');
      localStorage.setItem('reauth_reason', reason);

      // Broadcast to other tabs
      broadcastSessionChange(
        reason === 'user_mismatch' ? 'USER_CHANGED' : 'LOGOUT',
        oldUserId || undefined
      );

      // Redirect to GCGC SSO for automatic re-authentication
      const callbackUrl = `${TMS_CLIENT_URL}/auth/callback`;
      const gcgcSsoUrl = `${GCGC_URL}/api/v1/auth/sso?callbackUrl=${encodeURIComponent(callbackUrl)}`;

      log.auth.info('[Session Sync] Redirecting to GCGC SSO for re-authentication');
      window.location.href = gcgcSsoUrl;
      return;
    }

    // For root page: let page.tsx handle the flow
    const isRootPage = window.location.pathname === '/';
    if (isRootPage) {
      log.auth.info('[Session Sync] Root page detected, letting page.tsx handle flow');
      return;
    }

    // Broadcast logout to other tabs
    broadcastSessionChange('LOGOUT', oldUserId || undefined);

    // Default: redirect to SSO check for other scenarios
    const redirectUrl = `${TMS_SERVER_URL}/api/v1/auth/sso/check`;
    log.auth.info('[Session Sync] Redirecting to SSO check');
    window.location.href = redirectUrl;
  };

  /**
   * Broadcast session changes to other tabs via localStorage events
   */
  const broadcastSessionChange = (type: SessionEvent['type'], userId?: string) => {
    if (typeof window === 'undefined') return;

    const event: SessionEvent = {
      type,
      timestamp: Date.now(),
      userId,
    };

    if (DEBUG) log.auth.info('[Session Sync] Broadcasting event:', event);

    // Set and immediately remove to trigger storage event in other tabs
    localStorage.setItem('session_event', JSON.stringify(event));
    localStorage.removeItem('session_event');
  };

  /**
   * Set up session synchronization
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Record mount time for grace period checks
    mountTime.current = Date.now();

    // 1. Validate on mount with cross-tab coordination
    // Only validate if no other tab validated recently (prevents race conditions)
    // Skip validation for authenticated pages to prevent refresh redirects
    const lastGlobalValidation = localStorage.getItem('last_validation_timestamp');
    const now = Date.now();

    // Skip validation on mount for authenticated pages (user already inside app)
    // This prevents race conditions with layout auth checks during page refreshes
    const currentPath = window.location.pathname;
    const isAuthenticatedPage = currentPath.startsWith('/chats') ||
                                currentPath.startsWith('/settings') ||
                                currentPath.startsWith('/profile');

    if (isAuthenticatedPage) {
      if (DEBUG) log.auth.info('[Session Sync] Skipping mount validation on authenticated page:', currentPath);
      // Validation will still run on focus events and periodic checks
    } else if (!lastGlobalValidation || now - parseInt(lastGlobalValidation) > RATE_LIMIT_WINDOW) {
      if (DEBUG) log.auth.info('[Session Sync] Mount validation (no recent validation found)');
      validateSession();
    } else {
      if (DEBUG) log.auth.info('[Session Sync] Skipping mount validation (another tab validated recently)');
    }

    // 2. Validate on window focus
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Skip focus validation within 2 seconds of mount
        // This handles the refresh scenario where visibility change fires immediately after mount
        const timeSinceMount = Date.now() - mountTime.current;
        if (timeSinceMount < 2000) {
          if (DEBUG) log.auth.info('[Session Sync] Skipping focus validation (recent mount, likely refresh)');
          return;
        }

        if (DEBUG) log.auth.info('[Session Sync] Tab gained focus - validating session');
        validateSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Periodic validation (every 60 seconds)
    intervalId.current = setInterval(() => {
      if (!document.hidden) {
        if (DEBUG) log.auth.info('[Session Sync] Periodic validation');
        validateSession();
      }
    }, VALIDATION_INTERVAL);

    // 4. Listen for storage events from other tabs
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === 'session_event' && event.newValue) {
        try {
          const eventData: SessionEvent = JSON.parse(event.newValue);

          if (DEBUG) {
            log.auth.info('[Session Sync] Received event from another tab:', eventData);
          }

          if (eventData.type === 'LOGOUT') {
            log.auth.info('[Session Sync] Logout detected in another tab');
            clearSession();
          } else if (eventData.type === 'USER_CHANGED') {
            log.auth.info('[Session Sync] User change detected in another tab');
            clearSession();
          } else if (eventData.type === 'LOGIN') {
            log.auth.info('[Session Sync] Login detected in another tab');
            // Optionally reload to sync new session
            window.location.reload();
          }
        } catch (error) {
          log.auth.error('[Session Sync] Failed to parse storage event:', error);
        }
      }

      // Also listen for direct token changes
      if (event.key === 'auth_token') {
        if (event.oldValue && !event.newValue) {
          // Token was removed (not just changed) - add grace period to prevent false positives
          log.auth.info('[Session Sync] Token removed in another tab, verifying...');
          setTimeout(() => {
            // Verify token is still missing after grace period
            if (!localStorage.getItem('auth_token')) {
              log.auth.info('[Session Sync] Token still missing after grace period - logging out');
              clearSession();
            } else {
              if (DEBUG) log.auth.info('[Session Sync] Token was restored - false alarm');
            }
          }, 500); // 500ms grace period
        }
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageEvent);
      if (intervalId.current) {
        clearInterval(intervalId.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    validateSession,
    clearSession,
  };
}
