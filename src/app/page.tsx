'use client';

import { log } from '@/lib/logger';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useSessionSync } from '@/lib/auth-session-sync';
import { authService } from '@/features/auth/services/authService';
import { socketClient } from '@/lib/socket';

const TMS_SERVER_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
                       'http://localhost:8000';
const GCGC_URL = process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL || '';
const TMS_CLIENT_URL = process.env.NEXT_PUBLIC_TMS_CLIENT_URL ||
                       (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, checkAuth } = useAuthStore();
  const [processing, setProcessing] = useState(true);

  // Enable session synchronization with GCGC
  useSessionSync();

  useEffect(() => {
    const initializeAuth = async () => {
      log.auth.info('🔐 SSO: Initializing authentication...');

      // Clear re-authentication flags if present
      if (typeof window !== 'undefined') {
        const isReauth = localStorage.getItem('reauthenticating') === 'true';
        if (isReauth) {
          const reason = localStorage.getItem('reauth_reason');
          log.auth.info('🔐 SSO: Re-authentication flow detected', { reason });
          localStorage.removeItem('reauthenticating');
          localStorage.removeItem('reauth_reason');
        }
      }

      // Step 1: Check if we have an SSO code in URL
      const ssoCode = searchParams?.get('sso_code');

      if (ssoCode) {
        log.auth.info('🔐 SSO: Found SSO code in URL, exchanging for JWT...');
        setProcessing(true);

        try {
          // Exchange SSO code for JWT token
          const response = await fetch(`${TMS_SERVER_URL}/api/v1/auth/sso/exchange`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code: ssoCode }),
          });

          if (!response.ok) {
            throw new Error(`SSO exchange failed: ${response.statusText}`);
          }

          const data = await response.json();
          log.auth.info('✅ SSO: Code exchange successful');

          // Detect account switch by comparing old vs new user ID
          const previousUserId = localStorage.getItem('current_user_id');
          const newUserId = data.user?.tmsUserId || data.user?.tms_user_id;

          if (previousUserId && newUserId && previousUserId !== newUserId) {
            log.auth.info('🔐 SSO: Account switch detected, clearing old session', {
              oldUserId: previousUserId,
              newUserId: newUserId,
            });

            // Disconnect socket to prevent old user's data from being received
            socketClient.disconnect();

            // Clear all cached data from previous user to prevent showing stale data
            localStorage.removeItem('user_data'); // Cached user profile from userService
            localStorage.removeItem('tms_session_active'); // Old session flag
            localStorage.removeItem('auth_token'); // Old user's token (will be replaced below)

            log.auth.info('✅ SSO: Old session cleared, socket disconnected');
          }

          // Store user ID BEFORE token (atomic initialization to prevent race conditions)
          if (newUserId) {
            localStorage.setItem('current_user_id', newUserId);
            log.auth.info('✅ SSO: User ID stored:', newUserId);
          }

          // Then store token and session flag
          if (data.token) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('session_active', 'true');
          }

          // Clear SSO code from URL and redirect to chats
          log.auth.info('✅ SSO: Redirecting to chats...');
          router.replace('/chats');
          return;

        } catch (error) {
          log.auth.error('❌ SSO: Code exchange failed:', error);
          // Clear invalid code from URL
          router.replace('/');
          setProcessing(false);
          return;
        }
      }

      // Step 2: Validate GCGC session matches TMS session (detect account switches)
      const gcgcToken = authService.extractSessionToken();
      const storedUserId = localStorage.getItem('current_user_id');

      if (gcgcToken && storedUserId) {
        try {
          log.auth.info('🔐 SSO: Validating GCGC session matches TMS session...');
          const response = await fetch(`${TMS_SERVER_URL}/api/v1/auth/validate-gcgc-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ gcgc_token: gcgcToken }),
          });

          if (response.ok) {
            const data = await response.json();
            const gcgcUserId = data.user?.id;

            // User ID mismatch = account switch detected
            if (gcgcUserId && gcgcUserId !== storedUserId) {
              log.auth.info('🔐 SSO: Account switch detected, clearing old session', {
                oldUserId: storedUserId,
                newUserId: gcgcUserId,
              });

              // Clear old session
              localStorage.removeItem('auth_token');
              localStorage.removeItem('current_user_id');
              localStorage.removeItem('tms_session_active');
              localStorage.removeItem('session_active');

              // Redirect to SSO for fresh authentication with new user
              const callbackUrl = `${TMS_CLIENT_URL}/auth/callback`;
              const gcgcSsoUrl = `${GCGC_URL}/api/v1/auth/sso?callbackUrl=${encodeURIComponent(callbackUrl)}`;
              log.auth.info('🔐 SSO: Redirecting to GCGC SSO for re-authentication...');
              window.location.href = gcgcSsoUrl;
              return;
            } else if (gcgcUserId) {
              log.auth.info('✅ SSO: GCGC session matches TMS session', { userId: gcgcUserId });
            }
          } else {
            log.auth.warn('⚠️ SSO: GCGC session validation failed, continuing with normal flow');
          }
        } catch (error) {
          log.auth.warn('⚠️ SSO: GCGC session validation error, continuing with normal flow:', error);
          // Continue with normal flow - don't block users on validation errors
        }
      }

      // Step 3: Check if already authenticated in TMS
      log.auth.info('🔐 SSO: Checking TMS authentication...');
      await checkAuth();

      const currentAuthState = useAuthStore.getState().isAuthenticated;

      if (currentAuthState) {
        // Already authenticated, go to chats
        log.auth.info('✅ SSO: Already authenticated, redirecting to chats...');
        router.push('/chats');
        setProcessing(false);
        return;
      }

      // Step 3: Not authenticated - redirect to GCGC SSO endpoint
      // GCGC SSO will detect if user is already logged in and auto-redirect back with token
      log.auth.info('🔐 SSO: Not authenticated, initiating SSO with GCGC...');
      const callbackUrl = `${TMS_CLIENT_URL}/auth/callback`;
      const gcgcSsoUrl = `${GCGC_URL}/api/v1/auth/sso?callbackUrl=${encodeURIComponent(callbackUrl)}`;
      log.auth.info('🔐 SSO: Redirecting to GCGC SSO:', gcgcSsoUrl);
      window.location.href = gcgcSsoUrl;
    };

    initializeAuth();
  }, [searchParams, checkAuth, router]);

  // Show loading while processing
  if (isLoading || processing) {
    // Check for re-authentication flags
    const isReauthenticating = typeof window !== 'undefined' &&
      localStorage.getItem('reauthenticating') === 'true';
    const reauthReason = typeof window !== 'undefined' &&
      localStorage.getItem('reauth_reason');

    // Determine loading message
    let loadingMessage = 'Checking authentication...';

    if (searchParams?.get('sso_code')) {
      loadingMessage = 'Completing login...';
    } else if (isReauthenticating) {
      loadingMessage = reauthReason === 'user_mismatch'
        ? 'Switching accounts...'
        : 'Re-authenticating...';
    }

    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  return null;
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Loading...</p>
        </div>
      </div>
    }>
      <HomePageContent />
    </Suspense>
  );
}
