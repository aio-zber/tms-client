'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to login or chats based on auth state
    // For now, redirect to login
    router.push('/login');
  }, [router]);

  return null;
}
