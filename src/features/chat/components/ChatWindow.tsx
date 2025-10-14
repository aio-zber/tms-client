/**
 * Chat Window Component
 * Main chat interface with header, message list, and input
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { Send, MoreVertical, Phone, Video } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { authService } from '@/features/auth/services/authService';
import { API_BASE_URL } from '@/lib/constants';
import Message from './Message';
import toast from 'react-hot-toast';
import { wsService, WebSocketMessage } from '../services/websocketService';

interface MessageType {
  id: string;
  content: string;
  sender_id: string;
  sender_name?: string;
  sender_avatar?: string;
  type: 'text' | 'image' | 'file';
  created_at: string;
  is_edited: boolean;
  reactions?: any[];
}

interface ConversationType {
  id: string;
  name: string;
  type: 'dm' | 'group';
  avatar_url?: string;
  members?: any[];
}

interface ChatWindowProps {
  conversationId: string;
}

export default function ChatWindow({ conversationId }: ChatWindowProps) {
  const [conversation, setConversation] = useState<ConversationType | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversationId) {
      fetchConversation();
      fetchMessages();
    }
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // WebSocket Setup
  useEffect(() => {
    if (!conversationId) return;

    // Connect to WebSocket
    wsService.connect();
    wsService.joinConversation(conversationId);

    // Listen for new messages
    wsService.onNewMessage((message: WebSocketMessage) => {
      if (message.conversation_id === conversationId) {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message as MessageType];
        });
      }
    });

    // Listen for message edits
    wsService.onMessageEdited((message: WebSocketMessage) => {
      if (message.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? (message as MessageType) : m))
        );
      }
    });

    // Listen for message deletions
    wsService.onMessageDeleted((data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) => prev.filter((m) => m.id !== data.message_id));
      }
    });

    // Cleanup on unmount
    return () => {
      wsService.leaveConversation(conversationId);
      wsService.removeAllListeners();
    };
  }, [conversationId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversation = async () => {
    try {
      const token = authService.getStoredToken();
      const response = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setConversation(data);
      }
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  };

  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const token = authService.getStoredToken();
      const response = await fetch(
        `${API_BASE_URL}/messages/conversations/${conversationId}/messages?limit=50`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMessages(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || isSending) return;

    try {
      setIsSending(true);
      const token = authService.getStoredToken();

      const response = await fetch(`${API_BASE_URL}/messages/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          content: newMessage.trim(),
          type: 'text',
          metadata_json: {},
        }),
      });

      if (response.ok) {
        const sentMessage = await response.json();
        setMessages(prev => [...prev, sentMessage]);
        setNewMessage('');
        scrollToBottom();
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
            <AvatarImage src={conversation.avatar_url} />
            <AvatarFallback className="bg-viber-purple text-white">
              {getInitials(conversation.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-gray-900">{conversation.name}</h2>
            <p className="text-sm text-gray-500">
              {conversation.type === 'group'
                ? `${conversation.members?.length || 0} members`
                : 'Active now'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="text-gray-600">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-600">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-600">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No messages yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Start the conversation by sending a message
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <Message
                key={message.id}
                message={message}
                isOwnMessage={false} // Will be determined by comparing with current user
                showAvatar={
                  index === 0 ||
                  messages[index - 1].sender_id !== message.sender_id
                }
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSending}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || isSending}
            className="bg-viber-purple hover:bg-viber-purple-dark"
          >
            {isSending ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
