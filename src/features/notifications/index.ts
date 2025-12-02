/**
 * Notifications Feature Exports
 */

// Types
export type {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationPreferences,
  NotificationPreferencesUpdate,
} from './types';

// Hooks
export { useNotificationEvents } from './hooks/useNotificationEvents';
export { useNotificationSound } from './hooks/useNotificationSound';
export { useDndStatus } from './hooks/useDndStatus';
export { useNotificationPreferences } from './hooks/useNotificationPreferences';

// Services
export { notificationService } from './services/notificationService';
export { browserNotificationService } from './services/browserNotificationService';

// Components
export { NotificationToast } from './components/NotificationToast';
export { NotificationCenter } from './components/NotificationCenter';
export { NotificationBadge } from './components/NotificationBadge';
export { NotificationSettings } from './components/NotificationSettings';
