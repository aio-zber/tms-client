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

// API Request/Response Types

export interface CreateConversationRequest {
  type: ConversationType;
  member_ids: string[];
  name?: string; // Required for group conversations
  avatar_url?: string;
}

export interface UpdateConversationRequest {
  name?: string;
  avatar_url?: string;
}

export interface AddMembersRequest {
  member_ids: string[];
}

export interface UpdateConversationSettingsRequest {
  is_muted?: boolean;
  mute_until?: string;
  is_pinned?: boolean;
  custom_notifications?: boolean;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total?: number;
  has_more?: boolean;
}
