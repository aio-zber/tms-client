/**
 * Conversation-related type definitions
 */

export type ConversationType = 'dm' | 'group';

export type ConversationMemberRole = 'admin' | 'member';

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string; // Only for group conversations
  avatarUrl?: string;
  members: ConversationMember[];
  lastMessage?: {
    content: string;
    senderId: string;
    timestamp: string;
  };
  unreadCount: number;
  isMuted: boolean;
  muteUntil?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMember {
  userId: string;
  role: ConversationMemberRole;
  joinedAt: string;
  lastReadAt?: string;
}

export interface ConversationSettings {
  isMuted: boolean;
  muteUntil?: string;
  isPinned: boolean;
  customNotifications?: boolean;
}
