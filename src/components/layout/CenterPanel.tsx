'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ConversationListItem } from '@/components/chat/ConversationListItem';
import { mockConversations } from '@/lib/mockData';
import { Search, MessageSquarePlus, Filter } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function CenterPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const pathname = usePathname();

  // Extract conversation ID from pathname
  const activeConversationId = pathname.split('/').pop();

  // Filter conversations based on search
  const filteredConversations = mockConversations.filter((conv) =>
    conv.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Messages</h2>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition">
            <MessageSquarePlus className="w-5 h-5 text-viber-purple" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 pt-1">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-viber-purple text-white rounded-full text-sm font-medium">
            <span>All</span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
              {mockConversations.length}
            </span>
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition">
            <span>Unread</span>
            <span className="bg-gray-300 px-1.5 py-0.5 rounded-full text-xs">
              {mockConversations.filter((c) => c.unreadCount > 0).length}
            </span>
          </button>
          <button className="p-1.5 hover:bg-gray-100 rounded-lg transition ml-auto">
            <Filter className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        {filteredConversations.length > 0 ? (
          <div>
            {filteredConversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6">
              <p className="text-gray-500 mb-2">No conversations found</p>
              <p className="text-sm text-gray-400">
                Try searching with different keywords
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
