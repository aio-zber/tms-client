'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const TMS_SERVER_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
                       'https://tms-server-staging.up.railway.app';
const GCGC_URL = process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL ||
                 'https://gcgc-team-management-system-staging.up.railway.app';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        console.log('🔐 SSO Callback: Starting authentication...');

        // Step 1: Fetch token from GCGC
        // This is a first-party request to GCGC, so cookies will be sent
        console.log('🔐 SSO Callback: Fetching token from GCGC...');
        const tokenResponse = await fetch(
          `${GCGC_URL}/api/v1/auth/token`,
          {
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
            }
          }
        );

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error('❌ SSO Callback: Failed to fetch GCGC token:', errorText);
          throw new Error(`Failed to fetch GCGC token: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();
        const gcgcToken = tokenData.token;

        if (!gcgcToken) {
          console.error('❌ SSO Callback: No token in GCGC response:', tokenData);
          throw new Error('No token received from GCGC');
        }

        console.log('✅ SSO Callback: GCGC token received');

        // Step 2: Login to TMS-Server with GCGC token
        console.log('🔐 SSO Callback: Logging into TMS-Server...');
        const tmsResponse = await fetch(
          `${TMS_SERVER_URL}/api/v1/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ token: gcgcToken }),
          }
        );

        if (!tmsResponse.ok) {
          const errorText = await tmsResponse.text();
          console.error('❌ SSO Callback: Failed to login to TMS:', errorText);
          throw new Error(`Failed to login to TMS: ${tmsResponse.status}`);
        }

        const tmsData = await tmsResponse.json();
        const tmsToken = tmsData.token;

        if (!tmsToken) {
          console.error('❌ SSO Callback: No token in TMS response:', tmsData);
          throw new Error('No token received from TMS');
        }

        console.log('✅ SSO Callback: TMS token received');

        // Step 3: Store TMS token
        localStorage.setItem('auth_token', tmsToken);
        console.log('✅ SSO Callback: Token stored in localStorage');

        // Step 4: Redirect to /chats
        console.log('🔐 SSO Callback: Redirecting to /chats...');
        router.replace('/chats');
      } catch (error) {
        console.error('❌ SSO Callback: Error during authentication:', error);
        setError(error instanceof Error ? error.message : 'Authentication failed');

        // Wait a bit to show error, then redirect to home
        setTimeout(() => {
          console.log('🔐 SSO Callback: Redirecting to home page...');
          router.replace('/');
        }, 3000);
      }
    }

    handleCallback();
  }, [router]);

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
