/**
 * Notification Store (Zustand)
 * Manages notification state and preferences
 * Pattern: Follows authStore.ts - Zustand with devtools middleware
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Notification, NotificationPreferences } from '@/features/notifications/types';
import { log } from '@/lib/logger';

interface NotificationState {
  // In-app notifications (max 50, FIFO)
  notifications: Notification[];
  unreadCount: number;

  // Preferences (synced with server + localStorage)
  preferences: NotificationPreferences;
  mutedConversations: Set<string>;

  // UI state
  isNotificationCenterOpen: boolean;

  // Actions
  addNotification: (notification: Notification) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  removeNotification: (notificationId: string) => void;

  // Preferences
  updatePreferences: (preferences: Partial<NotificationPreferences>) => void;
  setPreferences: (preferences: NotificationPreferences) => void;
  muteConversation: (conversationId: string) => void;
  unmuteConversation: (conversationId: string) => void;
  setMutedConversations: (conversationIds: string[]) => void;

  // UI
  toggleNotificationCenter: () => void;
  setNotificationCenterOpen: (isOpen: boolean) => void;

  // Persistence
  hydrate: () => void;
  clearOnLogout: () => void;
}

// Default preferences
const DEFAULT_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  soundVolume: 75,
  browserNotificationsEnabled: false,
  enableMessageNotifications: true,
  enableMentionNotifications: true,
  enableReactionNotifications: true,
  enableMemberActivityNotifications: false,
  dndEnabled: false,
  dndStart: undefined,
  dndEnd: undefined,
};

// LocalStorage keys
const STORAGE_KEYS = {
  PREFERENCES: 'notification_preferences',
  MUTED_CONVERSATIONS: 'muted_conversations',
} as const;

/**
 * Load preferences from localStorage
 */
function loadPreferencesFromStorage(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (stored) {
      const parsed = JSON.parse(stored) as NotificationPreferences;
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch (error) {
    log.notification.error('Failed to load preferences from localStorage:', error);
  }

  return DEFAULT_PREFERENCES;
}

/**
 * Save preferences to localStorage
 */
function savePreferencesToStorage(preferences: NotificationPreferences): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
  } catch (error) {
    log.notification.error('Failed to save preferences to localStorage:', error);
  }
}

/**
 * Load muted conversations from localStorage
 */
function loadMutedConversationsFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.MUTED_CONVERSATIONS);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      return new Set(parsed);
    }
  } catch (error) {
    log.notification.error('Failed to load muted conversations from localStorage:', error);
  }

  return new Set();
}

/**
 * Save muted conversations to localStorage
 */
function saveMutedConversationsToStorage(mutedConversations: Set<string>): void {
  if (typeof window === 'undefined') return;

  try {
    const array = Array.from(mutedConversations);
    localStorage.setItem(STORAGE_KEYS.MUTED_CONVERSATIONS, JSON.stringify(array));
  } catch (error) {
    log.notification.error('Failed to save muted conversations to localStorage:', error);
  }
}

/**
 * Notification Store
 *
 * Usage:
 * ```tsx
 * import { useNotificationStore } from '@/store/notificationStore';
 *
 * function Component() {
 *   const { addNotification, notifications, unreadCount } = useNotificationStore();
 *   // ...
 * }
 * ```
 */
export const useNotificationStore = create<NotificationState>()(
  devtools(
    (set, _get) => ({
      // Initial state - hydrate from localStorage
      notifications: [],
      unreadCount: 0,
      preferences: loadPreferencesFromStorage(),
      mutedConversations: loadMutedConversationsFromStorage(),
      isNotificationCenterOpen: false,

      /**
       * Add a new notification to the store
       * Max 50 notifications (FIFO)
       */
      addNotification: (notification) => {
        set(
          (state) => {
            const MAX_NOTIFICATIONS = 50;
            let newNotifications = [...state.notifications, notification];

            // FIFO - remove oldest if exceeds max
            if (newNotifications.length > MAX_NOTIFICATIONS) {
              newNotifications = newNotifications.slice(-MAX_NOTIFICATIONS);
            }

            // Calculate unread count
            const unreadCount = newNotifications.filter((n) => !n.isRead).length;

            log.notification.debug('Notification added:', notification.type, unreadCount, 'unread');

            return {
              notifications: newNotifications,
              unreadCount,
            };
          },
          undefined,
          'notification/add'
        );
      },

      /**
       * Mark a notification as read
       */
      markAsRead: (notificationId) => {
        set(
          (state) => {
            const notifications = state.notifications.map((n) =>
              n.id === notificationId ? { ...n, isRead: true } : n
            );

            const unreadCount = notifications.filter((n) => !n.isRead).length;

            log.notification.debug('Notification marked as read:', notificationId);

            return { notifications, unreadCount };
          },
          undefined,
          'notification/markAsRead'
        );
      },

      /**
       * Mark all notifications as read
       */
      markAllAsRead: () => {
        set(
          (state) => {
            const notifications = state.notifications.map((n) => ({ ...n, isRead: true }));

            log.notification.debug('All notifications marked as read');

            return { notifications, unreadCount: 0 };
          },
          undefined,
          'notification/markAllAsRead'
        );
      },

      /**
       * Clear all notifications
       */
      clearAll: () => {
        log.notification.debug('All notifications cleared');

        set({ notifications: [], unreadCount: 0 }, undefined, 'notification/clearAll');
      },

      /**
       * Remove a specific notification
       */
      removeNotification: (notificationId) => {
        set(
          (state) => {
            const notifications = state.notifications.filter((n) => n.id !== notificationId);
            const unreadCount = notifications.filter((n) => !n.isRead).length;

            log.notification.debug('Notification removed:', notificationId);

            return { notifications, unreadCount };
          },
          undefined,
          'notification/remove'
        );
      },

      /**
       * Update notification preferences (partial update)
       */
      updatePreferences: (updates) => {
        set(
          (state) => {
            const preferences = { ...state.preferences, ...updates };

            // Persist to localStorage
            savePreferencesToStorage(preferences);

            log.notification.debug('Preferences updated:', updates);

            return { preferences };
          },
          undefined,
          'notification/updatePreferences'
        );
      },

      /**
       * Set notification preferences (full replace)
       */
      setPreferences: (preferences) => {
        // Persist to localStorage
        savePreferencesToStorage(preferences);

        log.notification.debug('Preferences set from server');

        set({ preferences }, undefined, 'notification/setPreferences');
      },

      /**
       * Mute a conversation
       */
      muteConversation: (conversationId) => {
        set(
          (state) => {
            const mutedConversations = new Set(state.mutedConversations);
            mutedConversations.add(conversationId);

            // Persist to localStorage
            saveMutedConversationsToStorage(mutedConversations);

            log.notification.debug('Conversation muted:', conversationId);

            return { mutedConversations };
          },
          undefined,
          'notification/muteConversation'
        );
      },

      /**
       * Unmute a conversation
       */
      unmuteConversation: (conversationId) => {
        set(
          (state) => {
            const mutedConversations = new Set(state.mutedConversations);
            mutedConversations.delete(conversationId);

            // Persist to localStorage
            saveMutedConversationsToStorage(mutedConversations);

            log.notification.debug('Conversation unmuted:', conversationId);

            return { mutedConversations };
          },
          undefined,
          'notification/unmuteConversation'
        );
      },

      /**
       * Set muted conversations from server
       */
      setMutedConversations: (conversationIds) => {
        const mutedConversations = new Set(conversationIds);

        // Persist to localStorage
        saveMutedConversationsToStorage(mutedConversations);

        log.notification.debug('Muted conversations set from server:', conversationIds.length);

        set({ mutedConversations }, undefined, 'notification/setMutedConversations');
      },

      /**
       * Toggle notification center open/closed
       */
      toggleNotificationCenter: () => {
        set(
          (state) => ({ isNotificationCenterOpen: !state.isNotificationCenterOpen }),
          undefined,
          'notification/toggleCenter'
        );
      },

      /**
       * Set notification center open state
       */
      setNotificationCenterOpen: (isOpen) => {
        set({ isNotificationCenterOpen: isOpen }, undefined, 'notification/setCenterOpen');
      },

      /**
       * Hydrate state from localStorage on mount
       */
      hydrate: () => {
        const preferences = loadPreferencesFromStorage();
        const mutedConversations = loadMutedConversationsFromStorage();

        log.notification.debug('Store hydrated from localStorage');

        set({ preferences, mutedConversations }, undefined, 'notification/hydrate');
      },

      /**
       * Clear all state on logout
       */
      clearOnLogout: () => {
        log.notification.debug('Clearing notification state on logout');

        set(
          {
            notifications: [],
            unreadCount: 0,
            isNotificationCenterOpen: false,
          },
          undefined,
          'notification/clearOnLogout'
        );
      },
    }),
    { name: 'NotificationStore' }
  )
);

// Selectors for optimized re-renders
export const selectNotifications = (state: NotificationState) => state.notifications;
export const selectUnreadCount = (state: NotificationState) => state.unreadCount;
export const selectPreferences = (state: NotificationState) => state.preferences;
export const selectMutedConversations = (state: NotificationState) => state.mutedConversations;
export const selectIsNotificationCenterOpen = (state: NotificationState) => state.isNotificationCenterOpen;
