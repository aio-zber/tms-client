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

const TMS_SERVER_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
                       'https://tms-server-staging.up.railway.app';

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

  /**
   * Validate session with TMS-Server
   * Returns true if session is valid, false if invalid
   */
  const validateSession = async (): Promise<boolean> => {
    // Skip if not in browser
    if (typeof window === 'undefined') {
      return true;
    }

    // Prevent concurrent validations
    if (validationInProgress.current) {
      if (DEBUG) console.log('[Session Sync] Validation already in progress, skipping');
      return true;
    }

    // Rate limiting: Don't validate more than once per 5 seconds
    const now = Date.now();
    if (now - lastValidation.current < RATE_LIMIT_WINDOW) {
      if (DEBUG) console.log('[Session Sync] Rate limit: skipping validation');
      return true;
    }

    const token = localStorage.getItem('auth_token');
    const currentUserId = localStorage.getItem('current_user_id');

    if (!token) {
      if (DEBUG) console.log('[Session Sync] No token found');
      return false;
    }

    try {
      validationInProgress.current = true;
      lastValidation.current = now;

      const startTime = Date.now();
      if (DEBUG) console.log('[Session Sync] Validating session...');

      const response = await fetch(`${TMS_SERVER_URL}/api/v1/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const latency = Date.now() - startTime;

      if (response.status === 401) {
        console.log('[Session Sync] Token invalid (401) - clearing session');
        clearSession();
        return false;
      }

      if (!response.ok) {
        console.warn(`[Session Sync] Validation failed with status ${response.status}`);
        // Don't logout on server errors - might be temporary
        return true;
      }

      const data: SessionValidationResponse = await response.json();

      if (!data.valid) {
        console.log('[Session Sync] Session invalid - clearing session');
        clearSession();
        return false;
      }

      // Check if user changed
      if (data.user?.tms_user_id && currentUserId && data.user.tms_user_id !== currentUserId) {
        console.log('[Session Sync] User changed - clearing session', {
          oldUserId: currentUserId,
          newUserId: data.user.tms_user_id,
        });
        clearSession();
        broadcastSessionChange('USER_CHANGED', data.user.tms_user_id);
        return false;
      }

      if (DEBUG) {
        console.log('[Session Sync] Session valid', {
          userId: data.user?.tms_user_id,
          latency: `${latency}ms`,
        });
      }

      return true;
    } catch (error) {
      console.error('[Session Sync] Validation error:', error);
      // Don't logout on network errors - might be temporary connection issue
      return true;
    } finally {
      validationInProgress.current = false;
    }
  };

  /**
   * Clear local session and redirect to SSO
   */
  const clearSession = () => {
    if (typeof window === 'undefined') return;

    console.log('[Session Sync] Clearing local session');

    const oldUserId = localStorage.getItem('current_user_id');

    // Clear all auth-related data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user_id');
    localStorage.removeItem('tms_session_active');

    // Broadcast logout to other tabs
    broadcastSessionChange('LOGOUT', oldUserId || undefined);

    // Redirect to SSO
    const redirectUrl = `${TMS_SERVER_URL}/api/v1/auth/sso/check`;

    console.log('[Session Sync] Redirecting to SSO');
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

    if (DEBUG) console.log('[Session Sync] Broadcasting event:', event);

    // Set and immediately remove to trigger storage event in other tabs
    localStorage.setItem('session_event', JSON.stringify(event));
    localStorage.removeItem('session_event');
  };

  /**
   * Set up session synchronization
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Validate on mount
    validateSession();

    // 2. Validate on window focus
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (DEBUG) console.log('[Session Sync] Tab gained focus - validating session');
        validateSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Periodic validation (every 60 seconds)
    intervalId.current = setInterval(() => {
      if (!document.hidden) {
        if (DEBUG) console.log('[Session Sync] Periodic validation');
        validateSession();
      }
    }, VALIDATION_INTERVAL);

    // 4. Listen for storage events from other tabs
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === 'session_event' && event.newValue) {
        try {
          const eventData: SessionEvent = JSON.parse(event.newValue);

          if (DEBUG) {
            console.log('[Session Sync] Received event from another tab:', eventData);
          }

          if (eventData.type === 'LOGOUT') {
            console.log('[Session Sync] Logout detected in another tab');
            clearSession();
          } else if (eventData.type === 'USER_CHANGED') {
            console.log('[Session Sync] User change detected in another tab');
            clearSession();
          } else if (eventData.type === 'LOGIN') {
            console.log('[Session Sync] Login detected in another tab');
            // Optionally reload to sync new session
            window.location.reload();
          }
        } catch (error) {
          console.error('[Session Sync] Failed to parse storage event:', error);
        }
      }

      // Also listen for direct token changes
      if (event.key === 'auth_token') {
        if (!event.newValue) {
          // Token removed - logout
          console.log('[Session Sync] Token removed in another tab');
          clearSession();
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
