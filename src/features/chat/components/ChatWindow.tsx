/**
 * Chat Window Component
 * Main chat interface with header, message list, and input
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Send, MoreVertical, Phone, Video, Search, Settings, Edit2, Users, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import toast from 'react-hot-toast';
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser';
import { useMessages, useSendMessage } from '@/features/messaging';
import { MessageList } from '@/features/messaging/components/MessageList';
import { useConversation, useConversationActions } from '@/features/conversations';
import { useUnreadCountSync } from '@/features/conversations/hooks/useUnreadCountSync';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { messageService } from '@/features/messaging/services/messageService';
import MessageSearchDialog from '@/features/messaging/components/MessageSearchDialog';
import EditConversationDialog from '@/features/conversations/components/EditConversationDialog';
import ConversationSettingsDialog from '@/features/conversations/components/ConversationSettingsDialog';
import { useRouter } from 'next/navigation';

interface ChatWindowProps {
  conversationId: string;
}

export default function ChatWindow({ conversationId }: ChatWindowProps) {
  const [newMessage, setNewMessage] = useState('');
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const router = useRouter();

  // Get current user from hook
  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || '';

  console.log('[ChatWindow] Current user ID:', currentUserId);
  console.log('[ChatWindow] Current user:', currentUser);

  // Use custom hooks for API integration
  const { conversation, loading: conversationLoading, refresh: refreshConversation } = useConversation(conversationId);
  const { messages, loading: messagesLoading, isFetchingNextPage, hasMore, loadMore } = useMessages(conversationId);
  const { sendMessage: sendMsg, sending } = useSendMessage();
  const { markAsRead, leaveConversation } = useConversationActions();
  const queryClient = useQueryClient();

  // Helper to get user name from conversation members
  // IMPORTANT: Memoized with useCallback to prevent infinite re-renders
  // For now, just return userId since ConversationMember doesn't include user details
  // TODO: Fetch user details from API or include in conversation response
  const getUserName = useCallback((userId: string): string => {
    // Return userId for now - the backend should enrich this data
    return userId.split('-')[0]; // Show first part of UUID
  }, []); // Empty deps - function logic doesn't depend on any props/state

  // Sync unread counts with WebSocket events
  useUnreadCountSync();

  const isLoading = conversationLoading || messagesLoading;

  // Auto-mark messages as DELIVERED when conversation opens (Telegram/Messenger pattern)
  const markDeliveredMutation = useMutation({
    mutationFn: async (convId: string) => {
      await messageService.markMessagesAsDelivered({
        conversation_id: convId,
        // No message_ids = marks ALL SENT messages as DELIVERED
      });
    },
    onSuccess: () => {
      // Refresh messages to show updated status
      queryClient.invalidateQueries({
        queryKey: ['messages', conversationId],
      });
    },
    onError: (error) => {
      console.error('Failed to mark messages as delivered:', error);
    },
  });

  // Mark messages as DELIVERED when conversation opens
  useEffect(() => {
    if (conversationId && !isLoading) {
      // Mark as delivered (SENT → DELIVERED)
      markDeliveredMutation.mutate(conversationId);

      // Also mark conversation as read for unread count
      markAsRead(conversationId);
    }
  }, [conversationId, isLoading]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    try {
      const message = await sendMsg({
        conversation_id: conversationId,
        content: newMessage.trim(),
        type: 'TEXT',
      });

      if (message) {
        setNewMessage('');
        // Message will appear via WebSocket broadcast automatically
        toast.success('Message sent');
      } else {
        toast.error('Failed to send message');
      }
    } catch (error: unknown) {
      console.error('Error sending message:', error);
      toast.error((error as Error).message || 'Failed to send message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleConversationUpdate = () => {
    refreshConversation();
    // Messages will update automatically via WebSocket
  };

  const handleLeaveConversation = async () => {
    // Redirect to chats list after leaving
    router.push('/chats');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-viber-purple mx-auto mb-4"></div>
          <p className="text-gray-500">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-500">Conversation not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <header className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={conversation.avatarUrl} />
            <AvatarFallback className="bg-viber-purple text-white">
              {getInitials(conversation.name || 'Chat')}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-gray-900">{conversation.name || 'Chat'}</h2>
            <p className="text-sm text-gray-500">
              {conversation.type === 'group'
                ? `${conversation.members?.length || 0} members`
                : 'Active now'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-600"
            onClick={() => setShowSearchDialog(true)}
            title="Search messages"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-600" title="Voice call">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-600" title="Video call">
            <Video className="h-5 w-5" />
          </Button>

          {/* Settings Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-600">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {conversation.type === 'group' && (
                <>
                  <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Conversation
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSettingsDialog(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Conversation Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowSettingsDialog(true)}
                    className="text-viber-purple"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Manage Members
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      if (confirm('Are you sure you want to leave this conversation?')) {
                        const success = await leaveConversation(conversationId);
                        if (success) {
                          toast.success('Left conversation');
                          handleLeaveConversation();
                        } else {
                          toast.error('Failed to leave conversation');
                        }
                      }
                    }}
                    className="text-red-600"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Leave Conversation
                  </DropdownMenuItem>
                </>
              )}
              {conversation.type === 'dm' && (
                <DropdownMenuItem onClick={() => setShowSettingsDialog(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Messages Area with scroll memory and pagination */}
      <MessageList
        messages={messages}
        loading={messagesLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasMore={hasMore}
        currentUserId={currentUserId}
        conversationId={conversationId} // For auto-mark-read
        onLoadMore={loadMore}
        isGroupChat={conversation.type === 'group'}
        enableAutoRead={true} // Enable Telegram/Messenger-style auto-read
        getUserName={getUserName}
      />

      {/* Message Input */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="bg-viber-purple hover:bg-viber-purple-dark"
          >
            {sending ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <MessageSearchDialog
        open={showSearchDialog}
        onOpenChange={setShowSearchDialog}
        conversationId={conversationId}
      />

      {conversation && (
        <>
          <EditConversationDialog
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            conversation={conversation}
            onUpdate={handleConversationUpdate}
          />

          <ConversationSettingsDialog
            open={showSettingsDialog}
            onOpenChange={setShowSettingsDialog}
            conversation={conversation}
            currentUserId={currentUserId}
            onUpdate={handleConversationUpdate}
            onLeave={handleLeaveConversation}
          />
        </>
      )}
    </div>
  );
}
