/**
 * Conversation List Component
 * Displays list of user conversations with search and selection
 */

'use client';

import { useState, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle, Search, Plus, FileText } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { formatSidebarTimestamp } from '@/lib/dateUtils';
import { useConversations, useConversationSearch } from '@/features/conversations';
import { useUnifiedSearch } from '@/features/messaging/hooks/useUnifiedSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser';
import { useIsUserOnline } from '@/hooks/usePresence';
import NewConversationDialog from '@/features/conversations/components/NewConversationDialog';
import type { Conversation } from '@/types/conversation';

/**
 * Helper component to display online indicator for a conversation.
 * Only shows for DM conversations when the other user is online.
 */
function ConversationOnlineIndicator({
  conversation,
  currentUserId,
}: {
  conversation: Conversation;
  currentUserId: string | undefined;
}) {
  // Get the other user's ID for DM conversations
  const otherUserId = useMemo(() => {
    if (conversation.type !== 'dm' || !currentUserId) return undefined;
    const otherMember = conversation.members.find(m => m.userId !== currentUserId);
    return otherMember?.userId;
  }, [conversation, currentUserId]);

  const isOnline = useIsUserOnline(otherUserId);

  // Only show indicator for DM conversations
  if (conversation.type !== 'dm') return null;

  return <OnlineIndicator isOnline={isOnline} size="md" />;
}

function ConversationListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id');

  const [searchQuery, setSearchQuery] = useState('');
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);

  // Get current user for determining "other" user in DM conversations
  const { user: currentUser } = useCurrentUser();

  // Use custom hook for conversations
  const {
    conversations,
    loading: isLoading,
    error: fetchError,
    refresh,
  } = useConversations();

  // Debounce search query to reduce API calls (for message search)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Conversation search (Telegram/Messenger pattern: fuzzy + backend)
  const {
    conversations: searchedConversations,
    isSearching: isSearchingConversations,
    isSearchActive,
  } = useConversationSearch({
    query: searchQuery, // Not debounced - hook handles debouncing internally
    limit: 20,
    enabled: true,
  });

  // Search messages when query is present
  const { messages: searchMessages, isSearching: isSearchingMessages } = useUnifiedSearch({
    query: debouncedSearchQuery,
    enabled: debouncedSearchQuery.length >= 2,
  });

  const error = fetchError ? fetchError.message : null;
  const isSearching = isSearchingConversations || isSearchingMessages;

  const handleConversationCreated = (conversationId: string) => {
    refresh();
    router.push(`/chats?id=${conversationId}`);
  };

  const handleConversationClick = (conversationId: string) => {
    router.push(`/chats?id=${conversationId}`);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Hybrid search strategy (Telegram/Messenger pattern):
  // - Query < 2 chars: Client-side filter (instant)
  // - Query >= 2 chars: Backend search (accurate + fuzzy)
  const displayConversations = isSearchActive
    ? searchedConversations // Backend search with fuzzy matching
    : searchQuery.length > 0 && searchQuery.length < 2
    ? conversations.filter(conv =>
        (conv.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      ) // Client-side filter for 1 char
    : conversations; // No search - show all

  const filteredConversations = displayConversations;

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center space-x-3 p-3 rounded-lg animate-pulse">
            <div className="w-12 h-12 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="text-red-500 mb-2">❌ {error}</div>
        <button
          onClick={() => refresh()}
          className="text-viber-purple hover:underline text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header with New Conversation Button */}
        <div className="p-3 border-b border-gray-200 space-y-3">
          <Button
            onClick={() => setShowNewConversationDialog(true)}
            className="w-full bg-viber-purple hover:bg-viber-purple-dark"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Conversation
          </Button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search conversations and messages..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {/* Show message search results if searching */}
        {debouncedSearchQuery.length >= 2 && searchMessages.length > 0 && (
          <div className="border-b border-gray-200 bg-gray-50">
            <div className="p-2 px-3">
              <div className="flex items-center text-xs text-gray-600 mb-2">
                <FileText className="w-3 h-3 mr-1" />
                <span className="font-medium">Messages ({searchMessages.length})</span>
                {isSearching && <span className="ml-2 text-gray-400">Searching...</span>}
              </div>
              <div className="space-y-1">
                {searchMessages.slice(0, 5).map((message) => (
                  <button
                    key={message.id}
                    onClick={() => handleConversationClick(message.conversation_id)}
                    className="w-full flex items-start space-x-2 p-2 rounded hover:bg-white transition-colors text-left"
                  >
                    <MessageCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5 truncate">
                        {message.conversation_name || 'Unknown Chat'}
                      </p>
                      <p className="text-sm text-gray-900 line-clamp-2">
                        {message.content}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {filteredConversations.length === 0 && searchMessages.length === 0 && debouncedSearchQuery ? (
          <div className="p-8 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              No results found
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Try a different search term
            </p>
          </div>
        ) : filteredConversations.length === 0 && !searchQuery ? (
          <div className="p-8 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              No conversations yet
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Start a new conversation
            </p>
          </div>
        ) : filteredConversations.length > 0 ? (
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => handleConversationClick(conversation.id)}
                className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                  selectedId === conversation.id ? 'bg-viber-purple-bg' : ''
                }`}
              >
                {/* Avatar with Online Indicator */}
                <div className="relative overflow-visible">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={conversation.avatarUrl} />
                    <AvatarFallback className="bg-viber-purple text-white">
                      {getInitials(conversation.display_name || conversation.name || 'Chat')}
                    </AvatarFallback>
                  </Avatar>
                  {/* Online indicator (Messenger-style green dot) */}
                  <ConversationOnlineIndicator
                    conversation={conversation}
                    currentUserId={currentUser?.id}
                  />
                  {/* Unread badge - positioned at top-right, above online indicator */}
                  {conversation.unreadCount && conversation.unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-baseline justify-between mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {conversation.display_name || conversation.name || 'Direct Message'}
                    </h3>
                    {conversation.lastMessage && (
                      <span className="text-xs text-gray-500 ml-2 shrink-0 min-w-fit">
                        {formatSidebarTimestamp(conversation.lastMessage.timestamp)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate">
                    {conversation.lastMessage ? (
                      <>
                        {conversation.type === 'group' && conversation.lastMessage.senderId && (
                          <span className="font-medium">
                            {conversation.lastMessage.senderId}:{' '}
                          </span>
                        )}
                        {conversation.lastMessage.content}
                      </>
                    ) : (
                      <span className="text-gray-400 italic">No messages yet</span>
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversationDialog}
        onOpenChange={setShowNewConversationDialog}
        onSuccess={handleConversationCreated}
      />
    </>
  );
}

export default function ConversationList() {
  return (
    <Suspense fallback={
      <div className="space-y-2 p-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center space-x-3 p-3 rounded-lg animate-pulse">
            <div className="w-12 h-12 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    }>
      <ConversationListContent />
    </Suspense>
  );
}
