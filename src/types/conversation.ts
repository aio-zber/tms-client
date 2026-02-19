/**
 * Conversation-related type definitions
 */

export type ConversationType = 'dm' | 'group';

export type ConversationMemberRole = 'admin' | 'member';

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string; // Only for group conversations
  display_name?: string; // Computed display name: for DMs = other user's name, for groups = group name
  avatarUrl?: string;
  members: ConversationMember[];
  lastMessage?: {
    content: string;
    senderId: string;
    timestamp: string;
    encrypted?: boolean;
    type?: string;
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
  user?: {
    id: string;
    tmsUserId: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    image?: string;
  };
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
  user_ids: string[];
}

export interface UpdateConversationSettingsRequest {
  is_muted?: boolean;
  mute_until?: string;
  is_pinned?: boolean;
  custom_notifications?: boolean;
}

export interface ConversationListResponse {
  data: Conversation[];
  pagination: {
    next_cursor?: string;
    has_more: boolean;
    limit: number;
  };
}

// WebSocket Event Payloads

export interface MemberAddedEvent {
  conversation_id: string;
  added_members: Array<{
    user_id: string;
    full_name: string;
    role: ConversationMemberRole;
  }>;
  added_by: string;
  timestamp: string;
}

export interface MemberRemovedEvent {
  conversation_id: string;
  removed_user_id: string;
  removed_by: string;
  timestamp: string;
}

export interface MemberLeftEvent {
  conversation_id: string;
  user_id: string;
  user_name: string;
  timestamp: string;
}

export interface ConversationUpdatedEvent {
  conversation_id: string;
  updated_by: string;
  name?: string;
  avatar_url?: string;
  timestamp: string;
}

export interface MessageDeletedEvent {
  conversation_id: string;
  message_id: string;
  deleted_by: string;
  deleted_by_name?: string;
  timestamp: string;
}
