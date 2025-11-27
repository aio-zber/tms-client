/**
 * Browser Notification Service
 * Handles browser Notification API interactions
 * Security: Only shows sender name (no message content)
 */

import type { Notification as AppNotification, NotificationPreferences } from '../types';
import { checkDndActive } from '../hooks/useDndStatus';
import { log } from '@/lib/logger';

// Rate limiting: Max 5 browser notifications per minute
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const notificationTimestamps: number[] = [];

/**
 * Check if browser notifications are supported
 */
export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Get current browser notification permission status
 */
export function getBrowserNotificationPermission(): NotificationPermission {
  if (!isBrowserNotificationSupported()) {
    return 'denied';
  }
  return Notification.permission;
}

/**
 * Request browser notification permission
 * Must be called from user action (click, etc.)
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationSupported()) {
    log.notification.warn('Browser notifications not supported');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    log.notification.warn('Browser notification permission already denied');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    log.notification.info('Browser notification permission:', permission);
    return permission;
  } catch (error) {
    log.notification.error('Failed to request browser notification permission:', error);
    return 'denied';
  }
}

/**
 * Check if rate limit allows showing a notification
 */
function checkRateLimit(): boolean {
  const now = Date.now();

  // Remove timestamps older than the rate limit window
  while (notificationTimestamps.length > 0 && notificationTimestamps[0] < now - RATE_LIMIT_WINDOW) {
    notificationTimestamps.shift();
  }

  // Check if we've exceeded the rate limit
  if (notificationTimestamps.length >= RATE_LIMIT_MAX) {
    log.notification.warn('Browser notification rate limit exceeded');
    return false;
  }

  return true;
}

/**
 * Record a notification timestamp for rate limiting
 */
function recordNotificationTimestamp(): void {
  notificationTimestamps.push(Date.now());
}

/**
 * Show a browser notification
 * Security: Only shows sender name (no message content)
 */
export async function showBrowserNotification(
  notification: AppNotification,
  preferences: NotificationPreferences
): Promise<void> {
  // Check if browser notifications are enabled in preferences
  if (!preferences.browserNotificationsEnabled) {
    return;
  }

  // Check if browser notifications are supported
  if (!isBrowserNotificationSupported()) {
    return;
  }

  // Check permission
  if (Notification.permission !== 'granted') {
    log.notification.debug('Browser notification permission not granted');
    return;
  }

  // Check DND mode (except for mentions)
  const isDndActive = checkDndActive(preferences);
  if (isDndActive && notification.type !== 'mention') {
    log.notification.debug('DND active - skipping browser notification');
    return;
  }

  // Check rate limit
  if (!checkRateLimit()) {
    return;
  }

  try {
    // Create notification title (sender name only - no content)
    let title = '';
    switch (notification.type) {
      case 'mention':
        title = `${notification.senderName} mentioned you`;
        break;
      case 'reaction':
        title = `${notification.senderName} reacted ${notification.metadata?.emoji || ''}`;
        break;
      case 'member_activity':
        title = `${notification.conversationName}`;
        break;
      case 'conversation_update':
        title = `${notification.conversationName} was updated`;
        break;
      case 'message':
      default:
        title = `${notification.senderName} sent a message`;
        break;
    }

    // Create browser notification (title only, no body)
    const browserNotification = new Notification(title, {
      icon: notification.senderAvatar || '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: notification.conversationId, // Group by conversation
      data: {
        conversationId: notification.conversationId,
        messageId: notification.metadata?.messageId,
        notificationId: notification.id,
      },
      requireInteraction: false,
      silent: false, // Let browser play default sound
    });

    // Record timestamp for rate limiting
    recordNotificationTimestamp();

    log.notification.debug('Browser notification shown:', title);

    // Handle click event
    browserNotification.onclick = () => {
      // Focus window if possible
      if (window.parent) {
        window.parent.focus();
      }
      window.focus();

      // Navigate to conversation
      const url = `/chat/${notification.conversationId}`;
      window.location.href = url;

      // Close notification
      browserNotification.close();
    };

    // Auto-close after 5 seconds
    setTimeout(() => {
      browserNotification.close();
    }, 5000);
  } catch (error) {
    log.notification.error('Failed to show browser notification:', error);
  }
}

/**
 * Clear all browser notifications for a conversation
 */
export function clearBrowserNotificationsForConversation(conversationId: string): void {
  if (!isBrowserNotificationSupported()) {
    return;
  }

  // Note: Notification API doesn't provide a way to close existing notifications by tag
  // ServiceWorker registration is needed for this functionality
  log.notification.debug('Clear notifications for conversation:', conversationId);
}

export const browserNotificationService = {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  showBrowserNotification,
  clearBrowserNotificationsForConversation,
};
