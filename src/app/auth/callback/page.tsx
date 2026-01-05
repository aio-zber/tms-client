'use client';
import { log } from '@/lib/logger';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

const TMS_SERVER_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
                       'https://tms-chat-staging.example.com';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { setToken } = useAuthStore();

  useEffect(() => {
    async function handleCallback() {
      try {
        log.auth.info('🔐 SSO Callback: Starting authentication...');

        // Step 1: Get token from URL query parameter
        const gcgcToken = searchParams?.get('gcgc_token');

        if (!gcgcToken) {
          log.auth.error('❌ SSO Callback: No token in URL parameters');
          throw new Error('No token received from GCGC');
        }

        log.auth.info('✅ SSO Callback: GCGC token received from URL');

        // Step 2: Login to TMS-Server with GCGC session token via SSO endpoint
        log.auth.info('🔐 SSO Callback: Logging into TMS-Server via SSO...');
        const tmsResponse = await fetch(
          `${TMS_SERVER_URL}/api/v1/auth/login/sso`,
          {
            method: 'POST',
            headers: {
              'X-GCGC-Session-Token': gcgcToken,  // Send as header for SSO authentication
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            credentials: 'include',
          }
        );

        if (!tmsResponse.ok) {
          const errorText = await tmsResponse.text();
          log.auth.error('❌ SSO Callback: Failed to login to TMS:', errorText);
          throw new Error(`Failed to login to TMS: ${tmsResponse.status}`);
        }

        const tmsData = await tmsResponse.json();
        const tmsToken = tmsData.token;

        if (!tmsToken) {
          log.auth.error('❌ SSO Callback: No token in TMS response:', tmsData);
          throw new Error('No token received from TMS');
        }

        log.auth.info('✅ SSO Callback: TMS token received');

        // Step 3: Store user ID BEFORE token (atomic initialization to prevent race conditions)
        // Note: Backend returns camelCase field names (tmsUserId, not tms_user_id)
        if (tmsData.user?.tmsUserId) {
          localStorage.setItem('current_user_id', tmsData.user.tmsUserId);
          log.auth.info('✅ SSO Callback: User ID stored:', tmsData.user.tmsUserId);
        }

        // Then store token and session flag
        localStorage.setItem('auth_token', tmsToken);
        localStorage.setItem('tms_session_active', 'true');

        setToken(tmsToken); // Update auth store state immediately
        log.auth.info('✅ SSO Callback: Token stored and auth state updated');

        // Step 4: Redirect to /chats
        log.auth.info('🔐 SSO Callback: Redirecting to /chats...');
        router.replace('/chats');
      } catch (error) {
        log.auth.error('❌ SSO Callback: Error during authentication:', error);
        setError(error instanceof Error ? error.message : 'Authentication failed');

        // Wait a bit to show error, then redirect to home
        setTimeout(() => {
          log.auth.info('🔐 SSO Callback: Redirecting to home page...');
          router.replace('/');
        }, 3000);
      }
    }

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {error ? (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-gray-900 font-medium mb-2">Authentication Failed</p>
            <p className="text-gray-600 text-sm mb-4">{error}</p>
            <p className="text-gray-500 text-xs">Redirecting to login page...</p>
          </>
        ) : (
          <>
            <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-900 font-medium mb-2">Completing sign-in...</p>
            <p className="text-gray-600 text-sm">Please wait while we authenticate your session</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-900 font-medium mb-2">Loading...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
