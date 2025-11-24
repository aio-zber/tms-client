/**
 * Message-related type definitions
 */

export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'VOICE' | 'POLL' | 'CALL' | 'SYSTEM';

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
  poll?: Poll; // Poll data for poll-type messages
  isEdited: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface PollOption {
  id: string;
  pollId: string;
  optionText: string;
  position: number;
  voteCount: number;
  voters?: string[]; // User IDs who voted for this
}

export interface Poll {
  id: string;
  messageId: string;
  question: string;
  options: PollOption[];
  multipleChoice: boolean;
  isClosed: boolean;
  expiresAt?: string;
  createdAt: string;
  totalVotes: number;
  userVotes: string[]; // Option IDs the current user voted for
}

export interface SystemMessageMetadata {
  eventType: 'member_added' | 'member_removed' | 'member_left' | 'message_deleted' | 'conversation_updated';
  actorId: string;
  actorName: string;
  targetUserId?: string;
  targetUserName?: string;
  addedMemberIds?: string[];
  addedMemberNames?: string[];
  details?: Record<string, unknown>;
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

  // For polls (deprecated - poll data now in message.poll field)
  pollId?: string;

  // For calls
  callId?: string;
  callType?: 'voice' | 'video';
  callDuration?: number;

  // For system messages
  system?: SystemMessageMetadata;
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
  conversation_id: string;
  message_ids: string[];
}

export interface MarkMessagesDeliveredRequest {
  conversation_id: string;
  message_ids?: string[];
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
  unread_count?: number;
  conversation_id?: string;
  total_unread_count?: number;
  conversations?: Record<string, number>;
}
