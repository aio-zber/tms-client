/**
 * Unified Chat Component
 * Feature-complete chat interface with messages, search, and actions
 * Replaces both page.tsx and ChatWindow.tsx implementations
 */

'use client';

import { log } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import { MessageList } from '@/features/messaging/components/MessageList';
import { MessageInput } from '@/features/messaging/components/MessageInput';
import { ChatSearchBar, useChatSearch, useJumpToMessage } from '@/features/messaging';
import { useMessages } from '@/features/messaging/hooks/useMessages';
import { useSendMessage } from '@/features/messaging/hooks/useSendMessage';
import { useMessageActions } from '@/features/messaging/hooks/useMessageActions';
import { useSocket } from '@/hooks/useSocket';
import { messageService } from '@/features/messaging/services/messageService';
import { CenterPanel } from '@/components/layout/CenterPanel';
import type { Message } from '@/types';
import { useConversationQuery } from '@/features/conversations/hooks/useConversationsQuery';
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser';
import { useLeaveConversation } from '@/features/conversations/hooks/useLeaveConversation';
import { useUserDisplayName } from '@/features/users/hooks/useUserDisplayName';
import ConversationSettingsDialog from '@/features/conversations/components/ConversationSettingsDialog';
import { useConversationEvents } from '@/features/conversations/hooks/useConversationEvents';
import { ChatHeader } from './ChatHeader';
import { UserProfileDialog } from '@/features/users/components/UserProfileDialog';

interface ChatProps {
  conversationId: string;
  className?: string;
  onMessageSent?: (message: Message) => void;
  customHeader?: React.ReactNode;
}

export function Chat({
  conversationId,
  className = '',
  onMessageSent,
  customHeader,
}: ChatProps) {
  // State
  const [replyToMessage, setReplyToMessage] = useState<Message | undefined>();
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<string | undefined>(undefined);
  const [showProfileDialog, setShowProfileDialog] = useState(false);

  // Hooks - Use existing hooks instead of manual implementation
  const { conversation, isLoading: loadingConversation } = useConversationQuery(conversationId, true);
  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || '';

  const { messages, loading, hasMore, loadMore, addOptimisticMessage } = useMessages(conversationId);
  const { sendMessage, sending } = useSendMessage();
  const { editMessage, deleteMessage, addReaction, removeReaction, switchReaction } = useMessageActions({ currentUserId });
  const handleLeaveConversationWithNav = useLeaveConversation(conversationId);
  const getUserName = useUserDisplayName(conversation ?? null);

  useSocket(); // Initialize WebSocket connection
  useConversationEvents({ conversationId }); // Handle real-time conversation updates

  // Jump to message hook for search navigation
  const {
    jumpToMessage,
    highlightedMessageId,
    searchHighlightId,
    registerMessageRef,
    clearSearchHighlight,
  } = useJumpToMessage();

  // Memoize search result selection callback to prevent infinite re-renders
  const handleSearchResultSelect = useCallback((messageId: string) => {
    jumpToMessage(messageId, { isSearchResult: true });
  }, [jumpToMessage]);

  // Chat search hook
  const {
    searchQuery,
    setSearchQuery,
    currentIndex,
    totalResults,
    goToNext,
    goToPrevious,
    closeSearch,
  } = useChatSearch({
    messages: messages || [],
    _enabled: isSearchOpen,
    onResultSelect: handleSearchResultSelect,
  });

  // Debug: Log messages whenever they change
  useEffect(() => {
    log.debug('[Chat] Messages updated:', messages);
    log.debug('[Chat] Messages count:', messages?.length);
  }, [messages]);

  // Detect if current user is admin
  const currentUserMember = conversation?.members.find(m => m.userId === currentUserId);
  const currentUserIsAdmin = currentUserMember?.role === 'admin';

  // Keyboard shortcut: Ctrl/Cmd+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Clear search highlight when closing search
  useEffect(() => {
    if (!isSearchOpen) {
      clearSearchHighlight();
    }
  }, [isSearchOpen, clearSearchHighlight]);

  // Handle search close - update local state and call hook's closeSearch
  const handleCloseSearch = () => {
    setSearchQuery("");
    setIsSearchOpen(false);
    closeSearch();
  };

  const handleSendMessage = async (content: string, replyToId?: string) => {
    log.debug('[Chat] Sending message:', content);

    const message = await sendMessage(
      {
        conversation_id: conversationId,
        content,
        type: 'TEXT',
        reply_to_id: replyToId,
      },
      // Optimistic update callback - add message immediately to UI
      (sentMessage) => {
        log.debug('[Chat] Message sent successfully, adding to UI optimistically:', sentMessage);
        addOptimisticMessage(sentMessage);
        onMessageSent?.(sentMessage);
      }
    );

    if (message) {
      log.debug('[Chat] Message confirmed:', message.id);
      setReplyToMessage(undefined);
    } else {
      log.error('[Chat] Failed to send message');
    }
  };

  const handleEditMessage = useCallback(
    (messageId: string) => {
      setEditingMessageId(messageId);
      setReplyToMessage(undefined); // Clear reply when editing
    },
    []
  );

  const handleSaveEdit = useCallback(
    async (messageId: string, newContent: string) => {
      if (newContent.trim()) {
        await editMessage(messageId, { content: newContent.trim() });
        setEditingMessageId(null);
        // No need to refresh - WebSocket will push the edit
      }
    },
    [editMessage]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  const handleDeleteMessage = useCallback(
    async (messageId: string, scope: 'me' | 'everyone' = 'everyone') => {
      const confirmMsg = scope === 'everyone'
        ? 'Delete this message for everyone? This cannot be undone.'
        : 'Delete this message for you? Others will still see it.';

      if (confirm(confirmMsg)) {
        await deleteMessage(messageId);
        // Backend will create and broadcast system message automatically
        // No need to refresh - WebSocket will push both the deletion and system message
      }
    },
    [deleteMessage]
  );

  const handleReply = (message: Message) => {
    setReplyToMessage(message);
  };

  const handleReact = useCallback(
    async (messageId: string, emoji: string) => {
      // Find the message
      const message = messages.find(m => m.id === messageId);
      if (!message || !currentUserId) return;

      // Find user's existing reactions (include temp ones for correct switching logic)
      // During rapid switching, we need to detect temp reactions to avoid incorrect behavior
      const userReactions = message.reactions?.filter(r => r.userId === currentUserId);
      const existingReaction = userReactions?.[userReactions.length - 1];

      if (existingReaction?.emoji === emoji) {
        // Toggle: same emoji clicked - remove it
        await removeReaction(messageId, emoji);
      } else if (existingReaction) {
        // Switch: different emoji clicked - replace old with new
        await switchReaction(messageId, existingReaction.emoji, emoji);
      } else {
        // Add: no existing reaction - add new one
        await addReaction(messageId, emoji);
      }
      // No need to refresh - WebSocket will push the reaction
    },
    [addReaction, removeReaction, switchReaction, messages, currentUserId]
  );

  const handleClearConversation = useCallback(async () => {
    const confirmed = confirm(
      'Are you sure you want to clear all messages in this conversation? This action cannot be undone.'
    );

    if (!confirmed) return;

    try {
      await messageService.clearConversation(conversationId);
      // Refresh messages list
      window.location.reload();
    } catch (error) {
      log.error('Failed to clear conversation:', error);
      alert('Failed to clear conversation. Please try again.');
    }
  }, [conversationId]);

  const getConversationTitle = (): string => {
    if (!conversation) return 'Loading...';
    if (conversation.type === 'group') return conversation.name || 'Group Chat';

    // For DM, show other user's name
    if (!conversation.members || conversation.members.length === 0) return 'Direct Message';

    const otherMember = conversation.members.find((m) => m.userId !== currentUserId);

    if (!otherMember) return 'Direct Message';

    // Use getUserName to get the actual user name
    return getUserName(otherMember.userId);
  };

  if (loadingConversation) {
    return (
      <div className={`h-full flex items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-viber-purple mx-auto mb-3" />
          <p className="text-gray-500">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className={`h-full flex items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-center p-6">
          <p className="text-gray-500 mb-4">Conversation not found</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed top-0 left-0 h-full w-[280px] sm:w-[320px] bg-white z-50 transform transition-transform duration-300 lg:hidden ${
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        } shadow-2xl`}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Chats</h2>
          <button
            onClick={() => setIsMobileDrawerOpen(false)}
            className="p-2 hover:bg-gray-100 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conversation List */}
        <div className="h-[calc(100%-73px)] overflow-y-auto">
          <CenterPanel />
        </div>
      </div>

      <div className={`h-full flex flex-col ${className}`}>
        {/* Chat Header */}
        {customHeader || (
          <ChatHeader
            conversation={conversation}
            conversationTitle={getConversationTitle()}
            currentUserIsAdmin={currentUserIsAdmin}
            currentUserId={currentUserId}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenSettings={() => setShowSettingsDialog(true)}
            onViewProfile={(userId) => {
              setSelectedUserProfile(userId);
              setShowProfileDialog(true);
            }}
            onClearConversation={handleClearConversation}
            onLeaveConversation={handleLeaveConversationWithNav}
            onMobileMenuToggle={() => setIsMobileDrawerOpen(true)}
            showMobileMenu={true}
          />
        )}

        {/* Search Bar */}
        <ChatSearchBar
          isOpen={isSearchOpen}
          onClose={handleCloseSearch}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          currentIndex={currentIndex}
          totalResults={totalResults}
          goToNext={goToNext}
          goToPrevious={goToPrevious}
        />

        {/* Messages Area */}
        <MessageList
          messages={messages}
          loading={loading}
          hasMore={hasMore}
          currentUserId={currentUserId}
          conversationId={conversationId}
          onLoadMore={loadMore}
          onEdit={handleEditMessage}
          onDelete={handleDeleteMessage}
          onReply={handleReply}
          onReact={handleReact}
          getUserName={getUserName}
          isGroupChat={conversation.type === 'group'}
          searchQuery={isSearchOpen ? searchQuery : ""}
          highlightedMessageId={highlightedMessageId}
          searchHighlightId={searchHighlightId}
          registerMessageRef={registerMessageRef}
        />

        {/* Message Input Area */}
        <MessageInput
          conversationId={conversationId}
          onSend={handleSendMessage}
          sending={sending}
          replyTo={replyToMessage}
          onCancelReply={() => setReplyToMessage(undefined)}
          editingMessage={editingMessageId ? messages.find(m => m.id === editingMessageId) : undefined}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
        />

        {/* Conversation Settings Dialog */}
        {conversation && (
          <ConversationSettingsDialog
            open={showSettingsDialog}
            onOpenChange={setShowSettingsDialog}
            conversation={conversation}
            currentUserId={currentUserId}
            onUpdate={() => {
              // Just close the dialog - WebSocket will handle the update
              setShowSettingsDialog(false);
            }}
            onLeave={handleLeaveConversationWithNav}
          />
        )}

        {/* User Profile Dialog */}
        <UserProfileDialog
          userId={selectedUserProfile}
          userData={selectedUserProfile ? conversation?.members.find(m => m.userId === selectedUserProfile)?.user : undefined}
          open={showProfileDialog}
          onOpenChange={setShowProfileDialog}
          showSendMessageButton={selectedUserProfile !== currentUserId}
        />
      </div>
    </>
  );
}
