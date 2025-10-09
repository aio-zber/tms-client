'use client';

import { usePathname } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { CenterPanel } from '@/components/layout/CenterPanel';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isChatsRoute = pathname.startsWith('/chats');

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
