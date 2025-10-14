'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    // Check authentication status on load
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // Redirect based on authentication state
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/chats');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-viber-purple border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return null;
}
