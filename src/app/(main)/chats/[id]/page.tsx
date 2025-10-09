'use client';

import { useParams } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { mockConversations, mockMessages, getUserInitials } from '@/lib/mockData';
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

export default function ChatPage() {
  const params = useParams();
  const conversationId = params.id as string;

  // Find the current conversation
  const conversation = mockConversations.find((c) => c.id === conversationId);

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
              {getUserInitials(conversation.name || 'Unknown')}
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
          {mockMessages.map((message) => {
            const isSentByMe = message.senderId === 'user-1';

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
                      {getUserInitials(conversation.name || 'U')}
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
          })}
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
