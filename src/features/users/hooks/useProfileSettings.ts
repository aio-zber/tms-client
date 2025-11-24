import { useState } from 'react';
import { useUserStore } from '@/store/userStore';
import type { UserSettings } from '@/types/user';

/**
 * Hook to manage local user settings
 *
 * Features:
 * - Updates only local settings (theme, notifications, privacy)
 * - Does NOT update TMS data (that's read-only)
 * - Provides loading state during updates
 * - Handles errors gracefully
 *
 * @returns { settings, updateSettings, isUpdating, error }
 */
export function useProfileSettings() {
  const { currentUser, updateCurrentUser } = useUserStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settings = currentUser?.settings || {
    theme: 'system',
    notifications: {
      enabled: true,
      sound: true,
      desktop: true,
    },
    privacy: {
      readReceipts: true,
      lastSeen: true,
      profilePhoto: 'everyone' as const,
    },
  };

  /**
   * Update local user settings
   * @param updates - Partial settings to update
   */
  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!currentUser) {
      setError('No current user found');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      // Merge new settings with existing settings
      const newSettings: UserSettings = {
        ...settings,
        ...updates,
        notifications: {
          ...settings.notifications,
          ...(updates.notifications || {}),
        },
        privacy: {
          ...settings.privacy,
          ...(updates.privacy || {}),
        },
      };

      // Update user in store (this will persist to localStorage/API)
      await updateCurrentUser({
        settings: newSettings,
      });

      console.log('[useProfileSettings] Settings updated successfully:', newSettings);
      setIsUpdating(false);
    } catch (err) {
      console.error('[useProfileSettings] Failed to update settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      setIsUpdating(false);
    }
  };

  return {
    settings,
    updateSettings,
    isUpdating,
    error,
  };
}
