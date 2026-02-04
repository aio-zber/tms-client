/**
 * Conversation List Component
 * Displays list of user conversations with search and selection
 */

'use client';

import { useState, Suspense, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle, Search, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { formatSidebarTimestamp } from '@/lib/dateUtils';
import { getUserImageUrl } from '@/lib/imageUtils';
import {
  getConversationDisplayName,
  getNameInitials,
  getOtherUserId,
} from '@/lib/conversationUtils';
import { useConversations, useConversationSearch } from '@/features/conversations';
import { useUnifiedSearch } from '@/features/messaging/hooks/useUnifiedSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser';
import { useIsUserOnline } from '@/hooks/usePresence';
import NewConversationDialog from '@/features/conversations/components/NewConversationDialog';
import type { Conversation } from '@/types/conversation';

/**
 * Highlights matching text in search results (Viber-style purple highlight).
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="text-viber-purple font-semibold">{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
}

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
  const otherUserId = useMemo(
    () => getOtherUserId(conversation, currentUserId),
    [conversation, currentUserId]
  );

  const isOnline = useIsUserOnline(otherUserId);

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
    isSearchActive,
  } = useConversationSearch({
    query: searchQuery, // Not debounced - hook handles debouncing internally
    limit: 20,
    enabled: true,
  });

  // Search messages when query is present
  const { messages: searchMessages } = useUnifiedSearch({
    query: debouncedSearchQuery,
    enabled: debouncedSearchQuery.length >= 2,
  });

  const error = fetchError ? fetchError.message : null;

  const handleConversationCreated = (conversationId: string) => {
    refresh();
    router.push(`/chats?id=${conversationId}`);
  };

  const handleConversationClick = (conversationId: string) => {
    router.push(`/chats?id=${conversationId}`);
  };

  // Build a lookup map from conversation ID to display name for message search results
  const conversationNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const conv of conversations) {
      map.set(conv.id, getConversationDisplayName(conv, currentUser?.id));
    }
    return map;
  }, [conversations, currentUser?.id]);

  // Resolve message search result conversation name
  const resolveMessageConversationName = useCallback(
    (message: { conversationId: string; conversationName?: string }) => {
      // First try the local lookup (most reliable - uses enriched member data)
      const localName = conversationNameMap.get(message.conversationId);
      if (localName) return localName;
      // Fallback to backend-provided name
      if (message.conversationName) return message.conversationName;
      return 'Chat';
    },
    [conversationNameMap]
  );

  // Hybrid search strategy (Telegram/Messenger pattern):
  // - Query < 2 chars: Client-side filter (instant, no loading)
  // - Query >= 2 chars: Backend search (accurate + fuzzy)
  const displayConversations = useMemo(() => {
    if (isSearchActive) {
      return searchedConversations;
    }
    if (searchQuery.length > 0 && searchQuery.length < 2) {
      const query = searchQuery.toLowerCase();
      return conversations.filter(conv => {
        // Search by group name
        if (conv.name?.toLowerCase().includes(query)) return true;
        // Search by display_name
        if (conv.display_name?.toLowerCase().includes(query)) return true;
        // Search by member names (for DMs)
        const displayName = getConversationDisplayName(conv, currentUser?.id);
        if (displayName.toLowerCase().includes(query)) return true;
        return false;
      });
    }
    return conversations;
  }, [isSearchActive, searchedConversations, searchQuery, conversations, currentUser?.id]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center space-x-3 p-3 rounded-lg animate-pulse">
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-dark-border" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-dark-border rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="text-red-500 dark:text-red-400 mb-2">{error}</div>
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
        <div className="p-3 border-b border-gray-200 dark:border-dark-border space-y-3">
          <Button
            onClick={() => setShowNewConversationDialog(true)}
            className="w-full bg-viber-purple hover:bg-viber-purple-dark text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Conversation
          </Button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-dark-text-secondary" />
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
        {/* Message search results (Viber-style: conversation name, sender prefix, highlighted match) */}
        {debouncedSearchQuery.length >= 2 && searchMessages.length > 0 && (
          <div className="border-b border-gray-200 dark:border-dark-border">
            <div className="px-3 pt-3 pb-1">
              <span className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wide">
                Messages
              </span>
            </div>
            <div>
              {searchMessages.slice(0, 5).map((message) => {
                const convName = resolveMessageConversationName(message);
                return (
                  <button
                    key={message.id}
                    onClick={() => {
                      if (message.conversationId) {
                        handleConversationClick(message.conversationId);
                      }
                    }}
                    className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-border transition-colors text-left"
                  >
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarFallback className="bg-gray-200 dark:bg-dark-border text-gray-600 dark:text-dark-text-secondary text-xs">
                        {getNameInitials(convName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-dark-text truncate">
                        {convName}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-dark-text-secondary truncate">
                        {message.senderName && (
                          <span className="text-gray-600 dark:text-dark-text-secondary font-medium">{message.senderName}: </span>
                        )}
                        <HighlightMatch text={message.content} query={searchQuery} />
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {displayConversations.length === 0 && searchMessages.length === 0 && debouncedSearchQuery ? (
          <div className="p-8 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-gray-300 dark:text-dark-border mb-3" />
            <p className="text-gray-500 dark:text-dark-text-secondary text-sm">
              No results found
            </p>
            <p className="text-gray-400 dark:text-dark-text-secondary text-xs mt-1">
              Try a different search term
            </p>
          </div>
        ) : displayConversations.length === 0 && !searchQuery ? (
          <div className="p-8 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-gray-300 dark:text-dark-border mb-3" />
            <p className="text-gray-500 dark:text-dark-text-secondary text-sm">
              No conversations yet
            </p>
            <p className="text-gray-400 dark:text-dark-text-secondary text-xs mt-1">
              Start a new conversation
            </p>
          </div>
        ) : displayConversations.length > 0 ? (
          <div className="p-2 space-y-1">
            {displayConversations.map((conversation) => {
              const displayName = getConversationDisplayName(conversation, currentUser?.id);
              return (
                <button
                  key={conversation.id}
                  onClick={() => handleConversationClick(conversation.id)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition-colors ${
                    selectedId === conversation.id ? 'bg-viber-purple-bg dark:bg-viber-purple/15' : ''
                  }`}
                >
                  {/* Avatar with Online Indicator */}
                  <div className="relative overflow-visible">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={getUserImageUrl(conversation.avatarUrl)} />
                      <AvatarFallback className="bg-viber-purple text-white">
                        {getNameInitials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    {/* Online indicator (Messenger-style green dot) */}
                    <ConversationOnlineIndicator
                      conversation={conversation}
                      currentUserId={currentUser?.id}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-baseline justify-between mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-dark-text truncate">
                        {displayName}
                      </h3>
                      {conversation.lastMessage && (
                        <span className="text-xs text-gray-500 dark:text-dark-text-secondary ml-2 shrink-0 min-w-fit">
                          {formatSidebarTimestamp(conversation.lastMessage.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-gray-600 dark:text-dark-text-secondary truncate">
                        {conversation.lastMessage ? (
                          conversation.lastMessage.content
                        ) : (
                          <span className="text-gray-400 dark:text-dark-text-secondary italic">No messages yet</span>
                        )}
                      </p>
                      {conversation.unreadCount > 0 && (
                        <Badge className="bg-viber-purple hover:bg-viber-purple-dark shrink-0 h-5 min-w-5 px-1.5 text-xs">
                          {conversation.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
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
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-dark-border" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-dark-border rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-dark-border rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    }>
      <ConversationListContent />
    </Suspense>
  );
}
