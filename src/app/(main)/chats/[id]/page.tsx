/**
 * Chat Window Page
 * Displays the conversation messages and chat interface
 */

'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, MoreVertical, Loader2, X } from 'lucide-react';
import { MessageList } from '@/features/messaging/components/MessageList';
import { MessageInput } from '@/features/messaging/components/MessageInput';
import { useMessages } from '@/features/messaging/hooks/useMessages';
import { useSendMessage } from '@/features/messaging/hooks/useSendMessage';
import { useMessageActions } from '@/features/messaging/hooks/useMessageActions';
import { useSocket } from '@/hooks/useSocket';
import { conversationService } from '@/features/conversations/services/conversationService';
import { userService } from '@/features/users/services/userService';
import { messageService } from '@/features/messaging/services/messageService';
import { CenterPanel } from '@/components/layout/CenterPanel';
import type { Conversation, Message } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = use(params);
  const router = useRouter();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | undefined>();
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const { messages, loading, hasMore, loadMore, addOptimisticMessage } = useMessages(conversationId);
  const { sendMessage, sending } = useSendMessage();
  const { editMessage, deleteMessage, addReaction, removeReaction } = useMessageActions();
  useSocket(); // Initialize WebSocket connection

  // Debug: Log messages whenever they change
  useEffect(() => {
    console.log('[ChatPage] Messages updated:', messages);
    console.log('[ChatPage] Messages count:', messages?.length);
  }, [messages]);

  // Load conversation details
  useEffect(() => {
    const loadConversation = async () => {
      try {
        setLoadingConversation(true);
        const conv = await conversationService.getConversationById(conversationId);
        setConversation(conv);
      } catch (error) {
        console.error('Failed to load conversation:', error);
      } finally {
        setLoadingConversation(false);
      }
    };

    loadConversation();
  }, [conversationId]);

  // Get current user ID
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const user = await userService.getCurrentUser();
        console.log('[ChatPage] Current user:', user);
        console.log('[ChatPage] Current user ID:', user.id);
        setCurrentUserId(user.id);
      } catch (error) {
        console.error('Failed to load current user:', error);
      }
    };

    loadCurrentUser();
  }, []);

  // WebSocket is now enabled - no need for polling fallback
  // Real-time updates are handled by useMessages hook via WebSocket

  const handleSendMessage = async (content: string, replyToId?: string) => {
    console.log('[ChatPage] Sending message:', content);
    
    const message = await sendMessage(
      {
        conversation_id: conversationId,
        content,
        type: 'TEXT',
        reply_to_id: replyToId,
      },
      // Optimistic update callback - add message immediately to UI
      (sentMessage) => {
        console.log('[ChatPage] Message sent successfully, adding to UI optimistically:', sentMessage);
        addOptimisticMessage(sentMessage);
      }
    );

    if (message) {
      console.log('[ChatPage] Message confirmed:', message.id);
      setReplyToMessage(undefined);
    } else {
      console.error('[ChatPage] Failed to send message');
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
    async (messageId: string) => {
      if (confirm('Are you sure you want to delete this message?')) {
        await deleteMessage(messageId);
        // No need to refresh - WebSocket will push the deletion
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

      // Check if user already reacted with this emoji
      const existingReaction = message.reactions?.find(
        r => r.emoji === emoji && r.userId === currentUserId
      );

      if (existingReaction) {
        // Remove reaction
        await removeReaction(messageId, emoji);
      } else {
        // Add reaction
        await addReaction(messageId, emoji);
      }
      // No need to refresh - WebSocket will push the reaction
    },
    [addReaction, removeReaction, messages, currentUserId]
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
      console.error('Failed to clear conversation:', error);
      alert('Failed to clear conversation. Please try again.');
    }
  }, [conversationId]);

  const getUserName = (userId: string): string => {
    if (!conversation || !conversation.members) return 'Unknown';
    const member = conversation.members.find((m) => m.userId === userId);
    
    if (!member) return 'Unknown';
    
    // Check if member has enriched user data from backend
    const memberData = member as unknown as Record<string, unknown>;
    const userData = memberData.user as Record<string, unknown> | undefined;
    
    if (userData) {
      // Try to get full name from various fields
      const firstName = userData.firstName || userData.first_name || '';
      const middleName = userData.middleName || userData.middle_name || '';
      const lastName = userData.lastName || userData.last_name || '';
      const name = userData.name;
      
      // Build full name
      if (name) return String(name);
      
      const fullName = [firstName, middleName, lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      
      if (fullName) return fullName;
      
      // Fallback to email
      if (userData.email) return String(userData.email);
    }
    
    // Final fallback
    return `User ${userId?.slice(0, 8) || userId}`;
  };

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
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-viber-purple mx-auto mb-3" />
          <p className="text-gray-500">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center p-6">
          <p className="text-gray-500 mb-4">Conversation not found</p>
          <button
            onClick={() => router.push('/chats')}
            className="px-4 py-2 bg-viber-purple text-white rounded-full hover:bg-viber-purple-dark transition"
          >
            Back to conversations
          </button>
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

      <div className="h-full flex flex-col">
        {/* Chat Header */}
        <div className="p-3 md:p-4 border-b border-gray-200 bg-white flex items-center gap-2 md:gap-3">
          {/* Hamburger Menu (Mobile Only) */}
          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition lg:hidden"
            aria-label="Open conversations"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Avatar className="w-10 h-10 md:w-12 md:h-12">
            <AvatarImage src={conversation.avatarUrl} />
            <AvatarFallback className="bg-viber-purple text-white font-semibold">
              {getConversationTitle().charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

        <div className="flex-1 min-w-0">
          <h1 className="text-base md:text-lg font-semibold truncate">{getConversationTitle()}</h1>
          <p className="text-xs md:text-sm text-gray-500">
            {conversation.members.length} member{conversation.members.length > 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 hover:bg-gray-100 rounded-full transition">
                <MoreVertical className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem>View Details</DropdownMenuItem>
              <DropdownMenuItem>Mute Conversation</DropdownMenuItem>
              <DropdownMenuItem>Search Messages</DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleClearConversation}
                className="text-orange-600"
              >
                Clear Conversation
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600">
                Leave Conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <MessageList
        messages={messages}
        loading={loading}
        hasMore={hasMore}
        currentUserId={currentUserId || ''}
        conversationId={conversationId}
        onLoadMore={loadMore}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onReply={handleReply}
        onReact={handleReact}
        getUserName={getUserName}
        isGroupChat={conversation.type === 'group'}
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
      </div>
    </>
  );
}
