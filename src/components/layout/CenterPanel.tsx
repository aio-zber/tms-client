'use client';

import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ConversationListItem } from '@/components/chat/ConversationListItem';
import { conversationService } from '@/features/conversations/services/conversationService';
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const pathname = usePathname();

  // Extract conversation ID from pathname
  const activeConversationId = pathname.split('/').pop();

  // Get current user ID
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await userService.getCurrentUser();
        setCurrentUserId(user.id);
      } catch (error) {
        console.error('Failed to fetch current user:', error);
      }
    };

    fetchCurrentUser();
  }, []);

  // Load conversations from backend API
  useEffect(() => {
    const loadConversations = async () => {
      try {
        setLoading(true);
        const response = await conversationService.getConversations({
          limit: 50,
          offset: 0,
        });
        console.log('[CenterPanel] API Response:', response);
        console.log('[CenterPanel] Conversations data:', response.data);
        setConversations(response.data || []);
      } catch (error) {
        console.error('Failed to load conversations:', error);
        setConversations([]);
      } finally {
        setLoading(false);
      }
    };

    loadConversations();
  }, []);

  // Refresh conversations every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await conversationService.getConversations({
          limit: 50,
          offset: 0,
        });
        setConversations(response.data || []);
      } catch (error) {
        console.error('Failed to refresh conversations:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Filter conversations based on search
  // For DMs without names, we still want to show them when no search query
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true; // Show all when no search

    // Search by conversation name (for groups)
    if (conv.name?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return true;
    }

    // For DMs, search by member names or user IDs
    // TODO: Once we have user names enriched, search by those
    return false;
  });

  console.log('[CenterPanel] Conversations:', conversations.length);
  console.log('[CenterPanel] Filtered:', filteredConversations.length);
  console.log('[CenterPanel] Conversations data:', conversations);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header with Gradient */}
      <div className="p-3 md:p-4 bg-gradient-to-r from-viber-purple/5 to-viber-purple-light/5 border-b border-viber-purple/10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base md:text-lg lg:text-xl font-bold text-viber-purple">Messages</h2>
          <button
            onClick={() => setShowNewConversation(true)}
            className="p-2 hover:bg-viber-purple/10 rounded-lg transition-all duration-200 hover:scale-105"
            title="New Conversation"
          >
            <MessageSquarePlus className="w-5 h-5 md:w-6 md:h-6 text-viber-purple" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-viber-purple/50" />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 md:pl-11 pr-10 border-viber-purple/20 focus:border-viber-purple focus:ring-viber-purple/20 text-sm md:text-base"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-viber-purple/50 hover:text-viber-purple transition"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 md:gap-2 pt-1">
          <button className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 bg-viber-purple text-white rounded-full text-xs md:text-sm font-medium shadow-sm hover:bg-viber-purple-dark transition">
            <span>All</span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
              {conversations.length}
            </span>
          </button>
          <button className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 bg-viber-purple/10 text-viber-purple rounded-full text-xs md:text-sm font-medium hover:bg-viber-purple/20 transition">
            <span>Unread</span>
            <span className="bg-viber-purple/20 px-1.5 py-0.5 rounded-full text-xs">
              {conversations.filter((c) => c.unreadCount > 0).length}
            </span>
          </button>
          <button className="p-1.5 hover:bg-viber-purple/10 rounded-lg transition ml-auto">
            <Filter className="w-4 h-4 md:w-5 md:h-5 text-viber-purple" />
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
                currentUserId={currentUserId || undefined}
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
          window.location.href = `/chats/${conversationId}`;
        }}
      />
    </div>
  );
}
