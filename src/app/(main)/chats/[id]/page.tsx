/**
 * Chat Window Page
 * Displays the conversation messages and chat interface
 */

'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MoreVertical, Phone, Video, Loader2 } from 'lucide-react';
import { MessageList } from '@/features/messaging/components/MessageList';
import { MessageInput } from '@/features/messaging/components/MessageInput';
import { useMessages } from '@/features/messaging/hooks/useMessages';
import { useSendMessage } from '@/features/messaging/hooks/useSendMessage';
import { useMessageActions } from '@/features/messaging/hooks/useMessageActions';
import { conversationService } from '@/features/conversations/services/conversationService';
import { userService } from '@/features/users/services/userService';
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

  const { messages, loading, hasMore, loadMore, refresh } = useMessages(conversationId);
  const { sendMessage, sending } = useSendMessage();
  const { editMessage, deleteMessage } = useMessageActions();

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
        setCurrentUserId(user.id);
      } catch (error) {
        console.error('Failed to load current user:', error);
      }
    };

    loadCurrentUser();
  }, []);

  // Real-time polling (every 3 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 3000);

    return () => clearInterval(interval);
  }, [refresh]);

  const handleSendMessage = async (content: string, replyToId?: string) => {
    const message = await sendMessage({
      conversation_id: conversationId,
      content,
      type: 'text',
      reply_to_id: replyToId,
    });

    if (message) {
      setReplyToMessage(undefined);
      refresh();
    }
  };

  const handleEditMessage = useCallback(
    async (messageId: string) => {
      const newContent = prompt('Edit message:');
      if (newContent && newContent.trim()) {
        await editMessage(messageId, { content: newContent.trim() });
        refresh();
      }
    },
    [editMessage, refresh]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (confirm('Are you sure you want to delete this message?')) {
        await deleteMessage(messageId);
        refresh();
      }
    },
    [deleteMessage, refresh]
  );

  const handleReply = (message: Message) => {
    setReplyToMessage(message);
  };

  const getUserName = (userId: string): string => {
    if (!conversation || !conversation.members) return 'Unknown';
    const member = conversation.members.find((m) => m.userId === userId);
    return member ? `User ${userId?.slice(0, 8) || userId}` : 'Unknown';
  };

  const getConversationTitle = (): string => {
    if (!conversation) return 'Loading...';
    if (conversation.type === 'group') return conversation.name || 'Group Chat';

    // For DM, show other user's name
    if (!conversation.members || conversation.members.length === 0) return 'Direct Message';
    const otherMember = conversation.members.find((m) => m.userId !== currentUserId);
    return otherMember ? `User ${otherMember.userId?.slice(0, 8) || otherMember.userId}` : 'Direct Message';
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
    <div className="h-full flex flex-col">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-200 bg-white flex items-center gap-3">
        <button
          onClick={() => router.push('/chats')}
          className="p-2 hover:bg-gray-100 rounded-full transition lg:hidden"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <Avatar className="w-10 h-10">
          <AvatarImage src={conversation.avatarUrl} />
          <AvatarFallback className="bg-viber-purple text-white">
            {getConversationTitle().charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{getConversationTitle()}</h1>
          <p className="text-xs text-gray-500">
            {conversation.members.length} member{conversation.members.length > 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-2 hover:bg-gray-100 rounded-full transition"
            title="Voice call (coming soon)"
          >
            <Phone className="w-5 h-5 text-gray-600" />
          </button>
          <button
            className="p-2 hover:bg-gray-100 rounded-full transition"
            title="Video call (coming soon)"
          >
            <Video className="w-5 h-5 text-gray-600" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 hover:bg-gray-100 rounded-full transition">
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>View Details</DropdownMenuItem>
              <DropdownMenuItem>Mute Conversation</DropdownMenuItem>
              <DropdownMenuItem>Search Messages</DropdownMenuItem>
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
        onLoadMore={loadMore}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onReply={handleReply}
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
      />
    </div>
  );
}
