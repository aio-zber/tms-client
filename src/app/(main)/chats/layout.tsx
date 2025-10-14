/**
 * Chat Layout
 * Two-column layout with conversation list sidebar and main chat area
 */

'use client';

import { Suspense } from 'react';
import ConversationList from '@/features/chat/components/ConversationList';

export default function ChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left Sidebar - Conversation List */}
      <aside className="w-80 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<ConversationListSkeleton />}>
            <ConversationList />
          </Suspense>
        </div>
      </aside>

      {/* Main Content Area - Chat Window */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

/**
 * Skeleton loader for conversation list
 */
function ConversationListSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="flex items-center space-x-3 p-3 rounded-lg animate-pulse"
        >
          {/* Avatar skeleton */}
          <div className="w-12 h-12 rounded-full bg-gray-200" />

          {/* Content skeleton */}
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
