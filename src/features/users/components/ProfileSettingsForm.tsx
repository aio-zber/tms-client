import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useProfileSettings } from '../hooks/useProfileSettings';
import { Sun, Moon, Monitor, Bell, BellOff, Volume2, VolumeX, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { UserSettings } from '@/types/user';
import { useTheme } from '@/hooks/useTheme';

/**
 * Form component for editing local user settings
 *
 * Features:
 * - Theme selection (Light/Dark/System)
 * - Notification toggles
 * - Sound toggles
 * - Privacy settings (online status, last seen, read receipts)
 * - Real-time updates with loading states
 * - Viber purple accents
 *
 * Note: This ONLY updates local settings, NOT TMS user data
 */
export function ProfileSettingsForm() {
  const { settings, updateSettings, isUpdating } = useProfileSettings();
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const { setTheme: applyTheme } = useTheme();

  // Theme options
  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const;

  const handleThemeChange = async (theme: 'light' | 'dark' | 'system') => {
    setLocalSettings({ ...localSettings, theme });
    applyTheme(theme);
    await updateSettings({ theme });
  };

  const handleNotificationToggle = async (key: keyof UserSettings['notifications'], value: boolean) => {
    const updates = {
      notifications: {
        ...localSettings.notifications,
        [key]: value,
      },
    };
    setLocalSettings({ ...localSettings, ...updates });
    await updateSettings(updates);
  };

  const handlePrivacyToggle = async (key: keyof UserSettings['privacy'], value: boolean) => {
    const updates = {
      privacy: {
        ...localSettings.privacy,
        [key]: value,
      },
    };
    setLocalSettings({ ...localSettings, ...updates });
    await updateSettings(updates);
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Settings</h3>

      {/* Theme Section */}
      <div className="space-y-3 mb-6">
        <Label className="text-sm font-medium text-gray-700">Theme</Label>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleThemeChange(value)}
              disabled={isUpdating}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                localSettings.theme === value
                  ? 'border-viber-purple bg-viber-purple-bg text-viber-purple'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              } disabled:opacity-50`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator className="my-6" />

      {/* Notifications Section */}
      <div className="space-y-4 mb-6">
        <Label className="text-sm font-medium text-gray-700">Notifications</Label>

        {/* Enable Notifications */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {localSettings.notifications.enabled ? (
              <Bell className="w-5 h-5 text-viber-purple" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400" />
            )}
            <div>
              <p className="text-sm font-medium">Enable Notifications</p>
              <p className="text-xs text-gray-500">Receive message notifications</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleNotificationToggle('enabled', !localSettings.notifications.enabled)}
            disabled={isUpdating}
            className={localSettings.notifications.enabled ? 'border-viber-purple text-viber-purple' : ''}
          >
            {localSettings.notifications.enabled ? 'On' : 'Off'}
          </Button>
        </div>

        {/* Enable Sound */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {localSettings.notifications.sound ? (
              <Volume2 className="w-5 h-5 text-viber-purple" />
            ) : (
              <VolumeX className="w-5 h-5 text-gray-400" />
            )}
            <div>
              <p className="text-sm font-medium">Enable Sound</p>
              <p className="text-xs text-gray-500">Play notification sounds</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleNotificationToggle('sound', !localSettings.notifications.sound)}
            disabled={isUpdating}
            className={localSettings.notifications.sound ? 'border-viber-purple text-viber-purple' : ''}
          >
            {localSettings.notifications.sound ? 'On' : 'Off'}
          </Button>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Privacy Section */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-gray-700">Privacy</Label>

        {/* Show Last Seen */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {localSettings.privacy.lastSeen ? (
              <Eye className="w-5 h-5 text-viber-purple" />
            ) : (
              <EyeOff className="w-5 h-5 text-gray-400" />
            )}
            <div>
              <p className="text-sm font-medium">Show Last Seen</p>
              <p className="text-xs text-gray-500">Display your last active time</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrivacyToggle('lastSeen', !localSettings.privacy.lastSeen)}
            disabled={isUpdating}
            className={localSettings.privacy.lastSeen ? 'border-viber-purple text-viber-purple' : ''}
          >
            {localSettings.privacy.lastSeen ? 'On' : 'Off'}
          </Button>
        </div>

        {/* Show Read Receipts */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {localSettings.privacy.readReceipts ? (
              <Eye className="w-5 h-5 text-viber-purple" />
            ) : (
              <EyeOff className="w-5 h-5 text-gray-400" />
            )}
            <div>
              <p className="text-sm font-medium">Show Read Receipts</p>
              <p className="text-xs text-gray-500">Send read confirmations</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrivacyToggle('readReceipts', !localSettings.privacy.readReceipts)}
            disabled={isUpdating}
            className={localSettings.privacy.readReceipts ? 'border-viber-purple text-viber-purple' : ''}
          >
            {localSettings.privacy.readReceipts ? 'On' : 'Off'}
          </Button>
        </div>
      </div>

      {isUpdating && (
        <p className="text-xs text-gray-500 text-center mt-4">Saving changes...</p>
      )}
    </Card>
  );
}
