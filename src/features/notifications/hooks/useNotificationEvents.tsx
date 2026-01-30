/**
 * useNotificationEvents Hook
 * Listens to Socket.io events and creates notifications
 * Pattern: Follows useMessages.ts - Socket event handlers with query invalidation
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { socketClient } from '@/lib/socket';
import { useNotificationStore } from '@/store/notificationStore';
import { useUserStore } from '@/store/userStore';
import { queryClient, queryKeys } from '@/lib/queryClient';
import type { Message } from '@/types/message';
import type { Notification, NotificationType } from '../types';
import { showBrowserNotification } from '../services/browserNotificationService';
import { useNotificationSound } from './useNotificationSound';
import { NotificationToast } from '../components/NotificationToast';
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

    // @all and @everyone mention everyone
    if (cleanMention === 'all' || cleanMention === 'everyone') {
      return true;
    }

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
 * Properly waits for socket connection before attaching listeners
 */
export function useNotificationEvents() {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const preferences = useNotificationStore((state) => state.preferences);
  const mutedConversations = useNotificationStore((state) => state.mutedConversations);
  const currentUser = useUserStore((state) => state.currentUser);

  // Notification sound
  const { playSound } = useNotificationSound(preferences);

  // Track socket ready state
  const [isSocketReady, setIsSocketReady] = useState(false);

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

      // Play notification sound
      playSound();

      // Show in-app toast notification
      toast.custom(
        (t) => <NotificationToast notification={notification} toastId={t.id} />,
        { duration: 5000, position: 'top-right' }
      );

      // Show browser notification
      if (preferences.browserNotificationsEnabled) {
        showBrowserNotification(notification, preferences);
      }

      log.notification.info('Notification created:', notification.type);
    },
    [addNotification, preferences, mutedConversations, playSound]
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

  // Monitor socket connection state
  useEffect(() => {
    // Check immediately
    if (socketClient.isConnected()) {
      setIsSocketReady(true);
      return;
    }

    // Wait for socket to be ready
    const checkInterval = setInterval(() => {
      const socket = socketClient.getSocket();
      if (socket?.connected) {
        setIsSocketReady(true);
        clearInterval(checkInterval);
      }
    }, 100);

    // Also listen for connect event once socket is available
    const socket = socketClient.getSocket();
    if (socket) {
      const handleConnect = () => setIsSocketReady(true);
      const handleDisconnect = () => setIsSocketReady(false);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      return () => {
        clearInterval(checkInterval);
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      };
    }

    return () => clearInterval(checkInterval);
  }, []);

  // Main effect to set up notification listeners
  useEffect(() => {
    // Wait for socket to be ready before attaching listeners
    if (!isSocketReady) {
      log.notification.debug('Waiting for socket to be ready...');
      return;
    }

    const socket = socketClient.getSocket();
    if (!socket) {
      log.notification.warn('Socket not available despite ready state');
      return;
    }

    log.notification.info('Socket ready, attaching notification listeners');

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

      // Check if message should be grouped (mentions are never grouped)
      if (!isMentioned) {
        const shouldGroup = shouldGroupMessage(message.conversation_id, message.sender_id);
        if (shouldGroup) {
          log.notification.debug('Message grouped - skipping notification');
          return;
        }
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
    // Server payload: { message_id: string, reaction: { id, message_id, user_id, emoji, created_at } }
    const handleReactionAdded = (data: Record<string, unknown>) => {
      const payload = data as {
        message_id: string;
        reaction: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
      };

      const reactorId = payload.reaction.user_id;

      // Don't notify for own reactions
      if (reactorId === currentUser?.id) {
        return;
      }

      // Look up the message from TanStack Query cache to find sender and conversation
      let foundMessage: Message | undefined;
      const queriesData = queryClient.getQueriesData<{
        pages: Array<{ data: Message[] }>;
        pageParams: unknown[];
      }>({ queryKey: queryKeys.messages.lists() });

      for (const [, cachedData] of queriesData) {
        if (!cachedData?.pages) continue;
        for (const page of cachedData.pages) {
          const msg = page.data.find((m) => m.id === payload.message_id);
          if (msg) {
            foundMessage = msg;
            break;
          }
        }
        if (foundMessage) break;
      }

      // Only notify if it's YOUR message that was reacted to
      if (!foundMessage || foundMessage.senderId !== currentUser?.id) {
        return;
      }

      // Look up reactor's display name from user store cache
      const userStore = useUserStore.getState();
      const reactorUser = userStore.getCachedUser(reactorId);
      const reactorName = reactorUser?.name || reactorUser?.username || 'Someone';

      const notification: Notification = {
        id: `notif-reaction-${payload.message_id}-${Date.now()}`,
        type: 'reaction',
        conversationId: foundMessage.conversationId,
        conversationName: '', // Will use conversation lookup in toast if needed
        senderId: reactorId,
        senderName: reactorName,
        senderAvatar: reactorUser?.image,
        content: `Reacted ${payload.reaction.emoji} to your message`,
        timestamp: new Date().toISOString(),
        isRead: false,
        priority: 'low',
        metadata: {
          messageId: payload.message_id,
          emoji: payload.reaction.emoji,
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
  }, [createNotification, currentUser, shouldGroupMessage, isSocketReady]);
}
