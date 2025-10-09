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
