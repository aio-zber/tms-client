'use client';

import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ConversationListItem } from '@/components/chat/ConversationListItem';
import { userService } from '@/features/users/services/userService';
import { Search, MessageSquarePlus, Filter } from 'lucide-react';
import { usePathname } from 'next/navigation';
import NewConversationDialog from '@/features/conversations/components/NewConversationDialog';
import type { Conversation } from '@/types';

export function CenterPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const pathname = usePathname();

  // Extract conversation ID from pathname
  const activeConversationId = pathname.split('/').pop();

  // Load conversations from TMS API or backend
  useEffect(() => {
    const loadConversations = async () => {
      try {
        // For now, since this is TMS integration, we'll create placeholder conversations
        // In a real implementation, you'd have a conversations API endpoint
        const result = await userService.searchUsers({ query: '', limit: 10 });
        const users = result;
        
        // Get current user ID first
        const currentUserId = await getCurrentUserId();
        
        // Create conversation objects from TMS users for demo
        const userConversations: Conversation[] = users
          .filter(user => user.id !== currentUserId) // Don't include current user
          .slice(0, 5) // Limit to 5 conversations
          .map(user => ({
            id: `conv-${user.id}`,
            type: 'dm' as const,
            name: user.name || `${user.firstName} ${user.lastName}`.trim() || user.email,
            avatarUrl: user.image,
            members: [
              {
                userId: user.id,
                role: 'member' as const,
                joinedAt: new Date().toISOString(),
                lastReadAt: new Date().toISOString(),
              }
            ],
            lastMessage: {
              content: 'Start a conversation...',
              senderId: user.id,
              timestamp: new Date().toISOString(),
            },
            unreadCount: 0,
            isMuted: false,
            createdBy: user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));

        setConversations(userConversations);
      } catch (error) {
        console.error('Failed to load conversations:', error);
        setConversations([]); // Fallback to empty list
      } finally {
        setLoading(false);
      }
    };

    loadConversations();
  }, []);

  // Helper function to get current user ID
  const getCurrentUserId = async () => {
    try {
      const currentUser = await userService.getCurrentUser();
      return currentUser.id;
    } catch {
      return null;
    }
  };

  // Filter conversations based on search
  const filteredConversations = conversations.filter((conv) =>
    conv.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Messages</h2>
          <button
            onClick={() => setShowNewConversation(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="New Conversation"
          >
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
              {conversations.length}
            </span>
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition">
            <span>Unread</span>
            <span className="bg-gray-300 px-1.5 py-0.5 rounded-full text-xs">
              {conversations.filter((c) => c.unreadCount > 0).length}
            </span>
          </button>
          <button className="p-1.5 hover:bg-gray-100 rounded-lg transition ml-auto">
            <Filter className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6">
              <div className="animate-spin w-8 h-8 border-2 border-viber-purple border-t-transparent rounded-full mx-auto mb-3"></div>
              <p className="text-gray-500 mb-2">Loading conversations...</p>
              <p className="text-sm text-gray-400">
                Fetching from Team Management System
              </p>
            </div>
          </div>
        ) : filteredConversations.length > 0 ? (
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
              <p className="text-gray-500 mb-2">
                {searchQuery ? 'No conversations found' : 'No team members available'}
              </p>
              <p className="text-sm text-gray-400">
                {searchQuery 
                  ? 'Try searching with different keywords' 
                  : 'Check your Team Management System for available users'
                }
              </p>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onSuccess={(conversationId) => {
          // Navigate to the new conversation
          window.location.href = `/messages/${conversationId}`;
        }}
      />
    </div>
  );
}
