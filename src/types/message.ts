/**
 * Message-related type definitions
 */

export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'poll' | 'call';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  metadata?: MessageMetadata;
  replyTo?: Message;
  replyToId?: string;
  reactions?: MessageReaction[];
  isEdited: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface MessageMetadata {
  // For image/file messages
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  mimeType?: string;
  thumbnailUrl?: string;

  // For voice messages
  duration?: number;

  // For polls
  pollId?: string;

  // For calls
  callId?: string;
  callType?: 'voice' | 'video';
  callDuration?: number;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

// API Request/Response Types

export interface SendMessageRequest {
  conversation_id: string;
  content: string;
  type?: MessageType;
  reply_to_id?: string;
  metadata?: MessageMetadata;
}

export interface EditMessageRequest {
  content: string;
}

export interface AddReactionRequest {
  emoji: string;
}

export interface MarkMessagesReadRequest {
  message_ids: string[];
}

export interface SearchMessagesRequest {
  query: string;
  conversation_id?: string;
  type?: MessageType;
  sender_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export interface MessageListResponse {
  data: Message[];
  pagination?: {
    next_cursor?: string;
    has_more?: boolean;
    limit?: number;
  };
}

export interface UnreadCountResponse {
  unread_count: number;
}
