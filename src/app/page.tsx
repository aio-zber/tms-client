'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/features/auth/services/authService';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth, autoLoginFromGCGC } = useAuthStore();
  const [ssoAttempted, setSsoAttempted] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      // First, check if user is already authenticated in TMS
      await checkAuth();

      // If not authenticated in TMS, check for GCGC session
      const currentAuthState = useAuthStore.getState().isAuthenticated;

      if (!currentAuthState && !ssoAttempted) {
        // Check if GCGC session exists
        const gcgcToken = authService.extractSessionToken();

        if (gcgcToken) {
          console.log('🔐 SSO: GCGC session detected, attempting auto-login...');
          setSsoAttempted(true);

          try {
            // Auto-login using GCGC session
            await autoLoginFromGCGC();
            console.log('✅ SSO: Auto-login successful, redirecting to chats...');
            router.push('/chats');
          } catch (error) {
            console.error('❌ SSO: Auto-login failed:', error);
            // If SSO fails, redirect to GCGC login
            const gcgcLoginUrl = process.env.NEXT_PUBLIC_GCGC_LOGIN_URL ||
                                'https://gcgc-team-management-system-staging.up.railway.app/auth/signin';
            window.location.href = `${gcgcLoginUrl}?callbackUrl=${encodeURIComponent(window.location.href)}`;
          }
        } else if (!currentAuthState && ssoAttempted) {
          // No GCGC session found, redirect to GCGC login
          console.log('🔐 SSO: No GCGC session found, redirecting to GCGC login');
          const gcgcLoginUrl = process.env.NEXT_PUBLIC_GCGC_LOGIN_URL ||
                              'https://gcgc-team-management-system-staging.up.railway.app/auth/signin';
          window.location.href = `${gcgcLoginUrl}?callbackUrl=${encodeURIComponent(window.location.href)}`;
        }
      }
    };

    initializeAuth();
  }, [checkAuth, autoLoginFromGCGC, router, ssoAttempted]);

  useEffect(() => {
    // Redirect based on authentication state (only if SSO wasn't attempted or completed)
    if (!isLoading && ssoAttempted) {
      if (isAuthenticated) {
        router.push('/chats');
      } else {
        // No TMS auth and no GCGC session, redirect to GCGC
        const gcgcLoginUrl = process.env.NEXT_PUBLIC_GCGC_LOGIN_URL ||
                            'https://gcgc-team-management-system-staging.up.railway.app/auth/signin';
        window.location.href = `${gcgcLoginUrl}?callbackUrl=${encodeURIComponent(window.location.href)}`;
      }
    }
  }, [isAuthenticated, isLoading, router, ssoAttempted]);

  // Show loading while checking auth or attempting SSO
  if (isLoading || !ssoAttempted) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">
            {!ssoAttempted ? 'Checking authentication...' : 'Logging in...'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
