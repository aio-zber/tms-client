'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

const TMS_SERVER_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
                       'https://tms-server-staging.up.railway.app';

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, checkAuth } = useAuthStore();
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      console.log('🔐 SSO: Initializing authentication...');

      // Step 1: Check if we have an SSO code in URL
      const ssoCode = searchParams?.get('sso_code');

      if (ssoCode) {
        console.log('🔐 SSO: Found SSO code in URL, exchanging for JWT...');
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
          console.log('✅ SSO: Code exchange successful');

          // Store token in localStorage
          if (data.token) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('session_active', 'true');
          }

          // Clear SSO code from URL and redirect to chats
          console.log('✅ SSO: Redirecting to chats...');
          router.replace('/chats');
          return;

        } catch (error) {
          console.error('❌ SSO: Code exchange failed:', error);
          // Clear invalid code from URL
          router.replace('/');
          setProcessing(false);
          return;
        }
      }

      // Step 2: Check if already authenticated in TMS
      console.log('🔐 SSO: Checking TMS authentication...');
      await checkAuth();

      const currentAuthState = useAuthStore.getState().isAuthenticated;

      if (currentAuthState) {
        // Already authenticated, go to chats
        console.log('✅ SSO: Already authenticated, redirecting to chats...');
        router.push('/chats');
        setProcessing(false);
        return;
      }

      // Step 3: Not authenticated - initiate SSO flow via TMS-Server
      console.log('🔐 SSO: Not authenticated, initiating server-to-server SSO...');

      // Redirect to TMS-Server SSO check endpoint
      // TMS-Server will read GCGC cookies and handle the flow
      // Note: redirect_uri is hardcoded on server side for security (prevents open redirect attacks)
      const ssoCheckUrl = `${TMS_SERVER_URL}/api/v1/auth/sso/check`;

      console.log(`🔐 SSO: Redirecting to ${ssoCheckUrl}`);
      window.location.href = ssoCheckUrl;
    };

    initializeAuth();
  }, [searchParams, checkAuth, router]);

  // Show loading while processing
  if (isLoading || processing) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">
            {searchParams?.get('sso_code')
              ? 'Completing login...'
              : 'Checking authentication...'}
          </p>
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
