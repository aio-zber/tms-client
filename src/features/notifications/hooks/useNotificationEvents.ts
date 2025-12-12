/**
 * useNotificationEvents Hook
 * Listens to Socket.io events and creates notifications
 * Pattern: Follows useMessages.ts - Socket event handlers with query invalidation
 */

import { useEffect, useRef, useCallback } from 'react';
import { socketClient } from '@/lib/socket';
import { useNotificationStore } from '@/store/notificationStore';
import { useUserStore } from '@/store/userStore';
import type { Notification, NotificationType } from '../types';
import { showBrowserNotification } from '../services/browserNotificationService';
import { checkDndActive } from './useDndStatus';
import { log } from '@/lib/logger';

// Notification grouping state
interface NotificationGroup {
  conversationId: string;
  senderId: string;
  count: number;
  lastTimestamp: number;
}

const GROUPING_WINDOW_MS = 30000; // 30 seconds
const GROUPING_THRESHOLD = 3; // Group if 3+ messages

/**
 * Detect @mentions in message content
 * Supports both @username and @DisplayName
 */
function detectMention(messageContent: string, currentUser: { username?: string; displayName: string } | null): boolean {
  if (!currentUser) return false;

  const mentionRegex = /@([\w\s]+)/g;
  const mentions = messageContent.match(mentionRegex) || [];

  const currentUsername = currentUser.username?.toLowerCase();
  const currentDisplayName = currentUser.displayName?.toLowerCase();

  return mentions.some((mention) => {
    const cleanMention = mention.slice(1).toLowerCase().trim();

    // Try display name first (more intuitive)
    if (currentDisplayName && cleanMention === currentDisplayName) {
      return true;
    }

    // Fallback to username
    if (currentUsername && cleanMention === currentUsername) {
      return true;
    }

    return false;
  });
}

/**
 * Check if notification should be shown based on preferences and DND
 */
function shouldShowNotification(
  notificationType: NotificationType,
  preferences: ReturnType<typeof useNotificationStore.getState>['preferences'],
  isMuted: boolean
): boolean {
  // Never show notifications for muted conversations (except mentions)
  if (isMuted && notificationType !== 'mention') {
    return false;
  }

  // Check if DND is active
  const isDndActive = checkDndActive(preferences);

  if (isDndActive) {
    // DND exception: Always show @mentions
    if (notificationType === 'mention') {
      return true;
    }

    // Silence all other notifications during DND
    return false;
  }

  // Not in DND - check per-type preferences
  switch (notificationType) {
    case 'message':
      return preferences.enableMessageNotifications;
    case 'mention':
      return preferences.enableMentionNotifications;
    case 'reaction':
      return preferences.enableReactionNotifications;
    case 'member_activity':
      return preferences.enableMemberActivityNotifications;
    default:
      return true;
  }
}

/**
 * Hook to listen to Socket.io events and create notifications
 */
export function useNotificationEvents() {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const preferences = useNotificationStore((state) => state.preferences);
  const mutedConversations = useNotificationStore((state) => state.mutedConversations);
  const currentUser = useUserStore((state) => state.currentUser);

  // Notification grouping state
  const groupingMapRef = useRef<Map<string, NotificationGroup>>(new Map());

  /**
   * Create and show a notification
   */
  const createNotification = useCallback(
    (notification: Notification) => {
      // Check if conversation is muted
      const isMuted = mutedConversations.has(notification.conversationId);

      // Check if notification should be shown
      if (!shouldShowNotification(notification.type, preferences, isMuted)) {
        log.notification.debug('Notification filtered:', notification.type);
        return;
      }

      // Add to store
      addNotification(notification);

      // Show browser notification
      if (preferences.browserNotificationsEnabled) {
        showBrowserNotification(notification, preferences);
      }

      log.notification.info('Notification created:', notification.type);
    },
    [addNotification, preferences, mutedConversations]
  );

  /**
   * Check if message should be grouped
   */
  const shouldGroupMessage = useCallback((conversationId: string, senderId: string): boolean => {
    const key = `${conversationId}:${senderId}`;
    const group = groupingMapRef.current.get(key);

    if (!group) {
      // First message - start tracking
      groupingMapRef.current.set(key, {
        conversationId,
        senderId,
        count: 1,
        lastTimestamp: Date.now(),
      });
      return false;
    }

    const now = Date.now();
    const timeSinceLastMessage = now - group.lastTimestamp;

    // Reset if outside grouping window
    if (timeSinceLastMessage > GROUPING_WINDOW_MS) {
      groupingMapRef.current.set(key, {
        conversationId,
        senderId,
        count: 1,
        lastTimestamp: now,
      });
      return false;
    }

    // Increment count
    group.count++;
    group.lastTimestamp = now;

    // Group if threshold reached
    return group.count >= GROUPING_THRESHOLD;
  }, []);

  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket) {
      log.notification.warn('Socket not initialized');
      return;
    }

    // Handle new messages
    const handleNewMessage = (data: Record<string, unknown>) => {
      const message = data as {
        id: string;
        conversation_id: string;
        conversation_name: string;
        sender_id: string;
        sender_name: string;
        sender_avatar?: string;
        content: string;
        type?: string;
        created_at: string;
        metadata?: {
          system?: {
            eventType: 'member_added' | 'member_removed' | 'member_left' | 'conversation_updated' | 'message_deleted';
            actorId: string;
            actorName: string;
            targetUserId?: string;
            targetUserName?: string;
            addedMemberIds?: string[];
            addedMemberNames?: string[];
          };
        };
      };

      // Handle system messages differently
      if (message.type === 'SYSTEM' && message.metadata?.system) {
        const systemEvent = message.metadata.system;

        // Don't notify if you were the actor
        if (systemEvent.actorId === currentUser?.id) {
          return;
        }

        // Create notification based on event type
        if (systemEvent.eventType === 'member_added') {
          const addedNames = systemEvent.addedMemberNames?.join(', ') || 'members';
          const notification: Notification = {
            id: `notif-${message.id}`,
            type: 'member_activity',
            conversationId: message.conversation_id,
            conversationName: message.conversation_name,
            senderId: systemEvent.actorId,
            senderName: systemEvent.actorName,
            content: `${addedNames} was added to the conversation`,
            timestamp: message.created_at,
            isRead: false,
            priority: 'low',
            metadata: { action: 'added' },
          };
          createNotification(notification);
        } else if (systemEvent.eventType === 'member_removed') {
          const notification: Notification = {
            id: `notif-${message.id}`,
            type: 'member_activity',
            conversationId: message.conversation_id,
            conversationName: message.conversation_name,
            senderId: systemEvent.actorId,
            senderName: systemEvent.actorName,
            content: `${systemEvent.targetUserName || 'A member'} was removed from the conversation`,
            timestamp: message.created_at,
            isRead: false,
            priority: 'low',
            metadata: { action: 'removed' },
          };
          createNotification(notification);
        } else if (systemEvent.eventType === 'member_left') {
          const notification: Notification = {
            id: `notif-${message.id}`,
            type: 'member_activity',
            conversationId: message.conversation_id,
            conversationName: message.conversation_name,
            senderId: systemEvent.actorId,
            senderName: systemEvent.actorName,
            content: `${systemEvent.actorName} left the conversation`,
            timestamp: message.created_at,
            isRead: false,
            priority: 'low',
            metadata: { action: 'left' },
          };
          createNotification(notification);
        } else if (systemEvent.eventType === 'conversation_updated') {
          const notification: Notification = {
            id: `notif-${message.id}`,
            type: 'conversation_update',
            conversationId: message.conversation_id,
            conversationName: message.conversation_name,
            senderId: systemEvent.actorId,
            senderName: systemEvent.actorName,
            content: `Conversation settings were updated`,
            timestamp: message.created_at,
            isRead: false,
            priority: 'low',
          };
          createNotification(notification);
        }

        return; // Don't process system messages as regular messages
      }

      // Handle regular messages
      // Don't notify for own messages
      if (message.sender_id === currentUser?.id) {
        return;
      }

      // Check if message contains @mention
      const isMentioned = detectMention(message.content, currentUser);

      // Check if message should be grouped
      const shouldGroup = shouldGroupMessage(message.conversation_id, message.sender_id);

      if (shouldGroup) {
        log.notification.debug('Message grouped - skipping notification');
        return;
      }

      // Create notification
      const notification: Notification = {
        id: `notif-${message.id}`,
        type: isMentioned ? 'mention' : 'message',
        conversationId: message.conversation_id,
        conversationName: message.conversation_name,
        senderId: message.sender_id,
        senderName: message.sender_name,
        senderAvatar: message.sender_avatar,
        content: message.content.slice(0, 100), // Truncate preview
        timestamp: message.created_at,
        isRead: false,
        priority: isMentioned ? 'high' : 'medium',
        metadata: {
          messageId: message.id,
        },
      };

      createNotification(notification);
    };

    // Handle reactions
    const handleReactionAdded = (data: Record<string, unknown>) => {
      const reaction = data as {
        message_id: string;
        conversation_id: string;
        conversation_name: string;
        user_id: string;
        user_name: string;
        user_avatar?: string;
        emoji: string;
        message_sender_id: string;
      };

      // Only notify if it's YOUR message that was reacted to
      if (reaction.message_sender_id !== currentUser?.id) {
        return;
      }

      // Don't notify for own reactions
      if (reaction.user_id === currentUser?.id) {
        return;
      }

      const notification: Notification = {
        id: `notif-reaction-${reaction.message_id}-${Date.now()}`,
        type: 'reaction',
        conversationId: reaction.conversation_id,
        conversationName: reaction.conversation_name,
        senderId: reaction.user_id,
        senderName: reaction.user_name,
        senderAvatar: reaction.user_avatar,
        content: `Reacted with ${reaction.emoji}`,
        timestamp: new Date().toISOString(),
        isRead: false,
        priority: 'low',
        metadata: {
          messageId: reaction.message_id,
          emoji: reaction.emoji,
        },
      };

      createNotification(notification);
    };

    // NOTE: Member event handlers (handleMemberAdded, handleMemberRemoved, handleMemberLeft) removed.
    // Backend now sends system messages via message:new events, which are handled above in handleNewMessage.
    // See lines 209-281 for system message notification handling.

    // Handle conversation updated
    const handleConversationUpdated = (data: Record<string, unknown>) => {
      const conversationData = data as {
        conversation_id: string;
        conversation_name: string;
        updated_by_id: string;
        updated_by_name: string;
      };

      // Don't notify if you were the one who updated it
      if (conversationData.updated_by_id === currentUser?.id) {
        return;
      }

      const notification: Notification = {
        id: `notif-conversation-updated-${conversationData.conversation_id}-${Date.now()}`,
        type: 'conversation_update',
        conversationId: conversationData.conversation_id,
        conversationName: conversationData.conversation_name,
        senderId: conversationData.updated_by_id,
        senderName: conversationData.updated_by_name,
        content: `Conversation settings were updated`,
        timestamp: new Date().toISOString(),
        isRead: false,
        priority: 'low',
      };

      createNotification(notification);
    };

    // Register event listeners
    socketClient.onNewMessage(handleNewMessage);
    socketClient.onReactionAdded(handleReactionAdded);
    socketClient.onConversationUpdated(handleConversationUpdated);

    log.notification.info('Notification event listeners registered');

    // Cleanup
    return () => {
      socketClient.off('new_message', handleNewMessage);
      socketClient.off('reaction_added', handleReactionAdded);
      socketClient.off('conversation_updated', handleConversationUpdated);

      log.notification.info('Notification event listeners removed');
    };
  }, [createNotification, currentUser, shouldGroupMessage]);
}
