/**
 * Conversation List Component
 * Displays list of user conversations with search and selection
 */

'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle, Search, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { useConversations } from '@/features/conversations';
import NewConversationDialog from '@/features/conversations/components/NewConversationDialog';

function ConversationListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id');

  const [searchQuery, setSearchQuery] = useState('');
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);

  // Use custom hook for conversations
  const {
    conversations,
    loading: isLoading,
    error: fetchError,
    refresh,
  } = useConversations();

  const error = fetchError ? fetchError.message : null;

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

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return '';
    }
  };

  const filteredConversations = conversations.filter(conv =>
    (conv.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          onClick={refresh}
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
              placeholder="Search conversations..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {searchQuery ? 'Try a different search' : 'Start a new conversation'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => handleConversationClick(conversation.id)}
                className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                  selectedId === conversation.id ? 'bg-viber-purple-bg' : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={conversation.avatarUrl} />
                    <AvatarFallback className="bg-viber-purple text-white">
                      {getInitials(conversation.name || 'Chat')}
                    </AvatarFallback>
                  </Avatar>
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
                      {conversation.name || 'Direct Message'}
                    </h3>
                    {conversation.lastMessage && (
                      <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                        {formatTimestamp(conversation.lastMessage.timestamp)}
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
        )}
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
