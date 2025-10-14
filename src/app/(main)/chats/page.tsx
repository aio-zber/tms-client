'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ChatWindow from '@/features/chat/components/ChatWindow';

function ChatsContent() {
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('id');

  if (!conversationId) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto bg-viber-purple-bg rounded-full flex items-center justify-center">
              <span className="text-3xl">💬</span>
            </div>
          </div>
          <p className="text-gray-500 text-lg mb-2">Select a conversation to start messaging</p>
          <p className="text-gray-400 text-sm">Choose from your conversations on the left</p>
        </div>
      </div>
    );
  }

  return <ChatWindow conversationId={conversationId} />;
}

export default function ChatsPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-viber-purple border-t-transparent rounded-full"></div>
      </div>
    }>
      <ChatsContent />
    </Suspense>
  );
}
