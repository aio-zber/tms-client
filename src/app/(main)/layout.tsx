'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { AppHeader } from '@/components/layout/AppHeader';
import { CenterPanel } from '@/components/layout/CenterPanel';
import { useGlobalConversationEvents } from '@/features/conversations/hooks/useGlobalConversationEvents';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const isChatsRoute = pathname.startsWith('/chats');

  // Initialize global conversation event listeners
  useGlobalConversationEvents();

  // Redirect to root if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* App Header with Settings */}
      <AppHeader />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop: 2-column layout */}
        <div className="hidden lg:grid lg:grid-cols-[400px_1fr] h-full">
          {/* Center Panel - Messages/Conversations List */}
          <aside className="bg-white border-r border-gray-200">
            <CenterPanel />
          </aside>

          {/* Right Panel - Chat View (children) */}
          <main className="bg-gray-50 overflow-hidden">
            {isChatsRoute ? (
              children
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-500 text-lg mb-2">
                    Select a conversation to start messaging
                  </p>
                  <p className="text-gray-400 text-sm">
                    Choose from your conversations on the left
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Mobile/Tablet: Stack layout (will be enhanced later) */}
        <div className="lg:hidden h-full">
          {children}
        </div>
      </div>
    </div>
  );
}
