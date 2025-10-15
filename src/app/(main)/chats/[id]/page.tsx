/**
 * Chat Window Page
 * Displays the conversation messages and chat interface
 */

'use client';

import { use } from 'react';

interface ChatPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id } = use(params);

  return (
    <div className="h-full flex flex-col">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold">Conversation {id}</h1>
      </div>

      {/* Messages Area */}
      <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm">This conversation is ready!</p>
            <p className="text-xs mt-2">Conversation ID: {id}</p>
            <p className="text-xs mt-4 text-gray-400">
              Message interface coming soon...
            </p>
          </div>
        </div>
      </div>

      {/* Message Input Area */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-viber-purple"
              disabled
            />
            <button
              className="px-6 py-2 bg-viber-purple text-white rounded-full hover:bg-viber-purple-dark transition disabled:opacity-50"
              disabled
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Messaging functionality will be implemented next
          </p>
        </div>
      </div>
    </div>
  );
}
