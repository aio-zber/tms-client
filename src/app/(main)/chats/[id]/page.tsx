'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { tmsApi } from '@/lib/tmsApi';
import type { Conversation, Message } from '@/types';
import {
  Phone,
  Video,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Image as ImageIcon,
  Mic,
  BarChart3,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Helper function to get initials from a name string
const getNameInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
};

export default function ChatPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    const loadChatData = async () => {
      try {
        setLoading(true);
        
        // Get current user ID
        const currentUser = await tmsApi.getCurrentUser();
        setCurrentUserId(currentUser.id);
        
        // Extract user ID from conversation ID (format: conv-{userId})
        const userId = conversationId.replace('conv-', '');
        
        // Get user data from TMS to create conversation
        const user = await tmsApi.getUserById(userId);
        
        // Create conversation object from TMS user
        const conv: Conversation = {
          id: conversationId,
          type: 'dm',
          name: user.name || `${user.firstName} ${user.lastName}`.trim() || user.email,
          avatarUrl: user.image,
          members: [
            {
              userId: user.id,
              role: 'member',
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
        };
        
        setConversation(conv);
        
        // For now, set empty messages since we don't have a messaging backend yet
        // In a real implementation, you'd fetch messages from your messaging API
        setMessages([]);
        
      } catch (error) {
        console.error('Failed to load chat data:', error);
        setConversation(null);
      } finally {
        setLoading(false);
      }
    };

    if (conversationId) {
      loadChatData();
    }
  }, [conversationId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-viber-purple border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-500 text-lg mb-2">Loading conversation...</p>
          <p className="text-gray-400 text-sm">
            Fetching from Team Management System
          </p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">Conversation not found</p>
          <p className="text-gray-400 text-sm">
            Please select a conversation from the list
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Chat Header */}
      <header className="h-[60px] border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-viber-purple text-white font-semibold text-sm">
              {getNameInitials(conversation.name || 'Unknown')}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-gray-900">{conversation.name}</h2>
            <p className="text-xs text-viber-online">Online</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Phone className="w-5 h-5 text-gray-600" />
          </Button>
          <Button variant="ghost" size="icon">
            <Video className="w-5 h-5 text-gray-600" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="w-5 h-5 text-gray-600" />
          </Button>
        </div>
      </header>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-viber-purple text-white font-semibold">
                      {getNameInitials(conversation.name || 'Unknown')}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Start a conversation with {conversation.name}
                </h3>
                <p className="text-gray-500 text-sm">
                  Send a message to begin chatting with this team member from TMS.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const isSentByMe = message.senderId === currentUserId;

              return (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-2',
                    isSentByMe ? 'justify-end' : 'justify-start'
                  )}
                >
                  {!isSentByMe && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-gray-300 text-gray-700 text-xs">
                        {getNameInitials(conversation.name || 'U')}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={cn(
                      'max-w-[75%] rounded-lg px-4 py-2',
                      isSentByMe
                        ? 'bg-viber-purple text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                    )}
                  >
                    <p className="text-sm leading-relaxed">{message.content}</p>
                    <div
                      className={cn(
                        'flex items-center gap-1 mt-1 text-xs',
                        isSentByMe ? 'text-white/70' : 'text-gray-500'
                      )}
                    >
                      <span>
                        {formatDistanceToNow(new Date(message.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {isSentByMe && (
                        <span className="ml-1">
                          {message.status === 'read' && '✓✓'}
                          {message.status === 'delivered' && '✓✓'}
                          {message.status === 'sent' && '✓'}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSentByMe && <div className="w-8 shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="border-t border-gray-200 p-4 shrink-0">
        <div className="flex items-center gap-2">
          {/* Image Upload */}
          <Button variant="ghost" size="icon" className="shrink-0">
            <ImageIcon className="w-5 h-5 text-gray-500" />
          </Button>

          {/* File Upload */}
          <Button variant="ghost" size="icon" className="shrink-0">
            <Paperclip className="w-5 h-5 text-gray-500" />
          </Button>

          {/* Voice Message */}
          <Button variant="ghost" size="icon" className="shrink-0">
            <Mic className="w-5 h-5 text-gray-500" />
          </Button>

          {/* Message Input Field */}
          <div className="flex-1 relative">
            <Input
              type="text"
              placeholder="Type a message..."
              className="pr-20"
            />
            {/* Poll Icon */}
            <button className="absolute right-12 top-1/2 -translate-y-1/2">
              <BarChart3 className="w-5 h-5 text-gray-400 hover:text-gray-600" />
            </button>
            {/* Emoji Icon */}
            <button className="absolute right-3 top-1/2 -translate-y-1/2">
              <Smile className="w-5 h-5 text-gray-400 hover:text-gray-600" />
            </button>
          </div>

          {/* Send Button */}
          <Button
            size="icon"
            className="bg-viber-purple hover:bg-viber-purple-dark shrink-0"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
