'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useEncryptionStore } from '@/features/encryption/stores/keyStore';
import { EncryptionGate } from '@/features/encryption/components/EncryptionGate';
import { AppHeader } from '@/components/layout/AppHeader';
import ConversationList from '@/features/chat/components/ConversationList';
import { NotificationCenter } from '@/features/notifications';
import { useNotificationEvents } from '@/features/notifications';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { usePresenceInit } from '@/hooks/usePresence';
import { useTheme } from '@/hooks/useTheme';
import { SocketProvider } from '@/components/providers/SocketProvider';
import { log } from '@/lib/logger';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const encryptionInitStatus = useEncryptionStore((s) => s.initStatus);
  const isChatsRoute = pathname.startsWith('/chats');

  // Initialize theme (applies 'dark' class to <html> based on stored preference)
  useTheme();

  // Initialize notification event listeners
  useNotificationEvents();

  // Initialize presence tracking (online/offline status via WebSocket)
  usePresenceInit();

  // Initialize E2EE when authenticated but encryption not yet initialized
  useEffect(() => {
    if (isAuthenticated && encryptionInitStatus === 'uninitialized') {
      import('@/features/encryption')
        .then(({ encryptionService }) => encryptionService.initialize())
        .catch((err) => log.error('E2EE init failed in main layout:', err));
    }
  }, [isAuthenticated, encryptionInitStatus]);

  // Redirect to root if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-viber-purple border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-dark-text-secondary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <SocketProvider>
      <EncryptionGate>
      <div className="h-[100dvh] flex flex-col bg-gray-50 dark:bg-dark-bg">
        {/* App Header with Settings */}
        <AppHeader />

        {/* Notification Center Dialog */}
        <NotificationCenter />

        {/* WebSocket Connection Status Indicator */}
        <ConnectionStatus />

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          {/* Desktop: 2-column layout */}
          <div className="hidden lg:grid lg:grid-cols-[400px_1fr] h-full">
            {/* Center Panel - Messages/Conversations List */}
            <aside className="bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border">
              <ConversationList />
            </aside>

            {/* Right Panel - Chat View (children) */}
            <main className="bg-gray-50 dark:bg-dark-bg overflow-hidden">
              {isChatsRoute ? (
                children
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-gray-500 dark:text-dark-text-secondary text-lg mb-2">
                      Select a conversation to start messaging
                    </p>
                    <p className="text-gray-400 dark:text-dark-text-secondary text-sm">
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
      </EncryptionGate>
    </SocketProvider>
  );
}
