/**
 * Notification Types
 * Type definitions for the notification system
 */

export type NotificationType = 'message' | 'mention' | 'reaction' | 'member_activity' | 'conversation_update';

export type NotificationPriority = 'high' | 'medium' | 'low';

export interface Notification {
  id: string;
  type: NotificationType;
  conversationId: string;
  conversationName: string;
  conversationAvatar?: string;
  senderId?: string;
  senderName: string;
  senderAvatar?: string;
  content: string; // Truncated preview
  timestamp: string;
  isRead: boolean;
  priority: NotificationPriority;
  metadata?: {
    messageId?: string;
    emoji?: string;
    action?: 'added' | 'removed' | 'left';
  };
}

export interface NotificationPreferences {
  // Sound settings
  soundEnabled: boolean;
  soundVolume: number; // 0-100

  // Browser notifications
  browserNotificationsEnabled: boolean;

  // Notification types
  enableMessageNotifications: boolean;
  enableMentionNotifications: boolean;
  enableReactionNotifications: boolean;
  enableMemberActivityNotifications: boolean;

  // Do Not Disturb
  dndEnabled: boolean;
  dndStart?: string; // "22:00"
  dndEnd?: string; // "08:00"
}

// API Response types
export interface NotificationPreferencesResponse {
  success: boolean;
  data: NotificationPreferences;
}

export interface NotificationPreferencesUpdate {
  soundEnabled?: boolean;
  soundVolume?: number;
  browserNotificationsEnabled?: boolean;
  enableMessageNotifications?: boolean;
  enableMentionNotifications?: boolean;
  enableReactionNotifications?: boolean;
  enableMemberActivityNotifications?: boolean;
  dndEnabled?: boolean;
  dndStart?: string;
  dndEnd?: string;
}

export interface MutedConversation {
  conversationId: string;
  mutedAt: string;
}
