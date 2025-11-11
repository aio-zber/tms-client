'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/features/auth/services/authService';

export default function HomePage() {
  const router = useRouter();
  const { isLoading, checkAuth, autoLoginFromGCGC } = useAuthStore();
  const [ssoAttempted, setSsoAttempted] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      // First, check if user is already authenticated in TMS
      await checkAuth();

      // Get current authentication state
      const currentAuthState = useAuthStore.getState().isAuthenticated;

      // Mark SSO attempt as complete (always set to true to prevent infinite loading)
      setSsoAttempted(true);

      // If not authenticated in TMS, check for GCGC session
      if (!currentAuthState) {
        const gcgcToken = authService.extractSessionToken();

        if (gcgcToken) {
          // GCGC session exists, attempt auto-login
          console.log('🔐 SSO: GCGC session detected, attempting auto-login...');

          try {
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
        } else {
          // No GCGC session found, redirect to GCGC login immediately
          console.log('🔐 SSO: No GCGC session found, redirecting to GCGC login');
          const gcgcLoginUrl = process.env.NEXT_PUBLIC_GCGC_LOGIN_URL ||
                              'https://gcgc-team-management-system-staging.up.railway.app/auth/signin';
          window.location.href = `${gcgcLoginUrl}?callbackUrl=${encodeURIComponent(window.location.href)}`;
        }
      } else {
        // User is already authenticated in TMS, redirect to chats
        console.log('✅ Already authenticated, redirecting to chats...');
        router.push('/chats');
      }
    };

    initializeAuth();
  }, [checkAuth, autoLoginFromGCGC, router]);

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
