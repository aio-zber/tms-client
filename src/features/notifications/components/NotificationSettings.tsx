/**
 * NotificationSettings Component
 *
 * Comprehensive notification preferences UI following ProfileSettingsForm pattern
 *
 * Features:
 * - Sound toggle and volume slider (0-100)
 * - Browser notification toggle with permission request
 * - Notification type checkboxes (messages, mentions, reactions, member activity)
 * - DND (Do Not Disturb) schedule picker
 * - List of muted conversations with unmute buttons
 * - Server sync via useNotificationPreferences hook
 * - Optimistic UI updates with rollback on error
 * - Viber purple accents throughout
 *
 * Pattern: Follows ProfileSettingsForm.tsx structure
 * Max lines: 300
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { browserNotificationService } from '../services/browserNotificationService';
import type { NotificationPreferences } from '../types';
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Moon,
  CheckSquare,
  Square,
  X,
  Loader2
} from 'lucide-react';
import { log } from '@/lib/logger';

export function NotificationSettings() {
  const {
    preferences,
    mutedConversations,
    isLoading,
    updatePreferences,
    unmuteConversation,
    isUpdatingPreferences,
    isUnmutingConversation
  } = useNotificationPreferences();

  // Local state for immediate UI feedback
  const [localPreferences, setLocalPreferences] = useState<NotificationPreferences | null>(null);

  // Sync local state when server data changes
  useEffect(() => {
    if (preferences) {
      setLocalPreferences(preferences);
    }
  }, [preferences]);

  // Handle sound toggle
  const handleSoundToggle = () => {
    if (!localPreferences) return;
    const updated = { soundEnabled: !localPreferences.soundEnabled };
    setLocalPreferences({ ...localPreferences, ...updated });
    updatePreferences(updated);
  };

  // Handle volume change
  const handleVolumeChange = (value: number) => {
    if (!localPreferences) return;
    setLocalPreferences({ ...localPreferences, soundVolume: value });
  };

  const handleVolumeChangeComplete = (value: number) => {
    updatePreferences({ soundVolume: value });
  };

  // Handle browser notifications toggle
  const handleBrowserNotificationsToggle = async () => {
    if (!localPreferences) return;

    if (!localPreferences.browserNotificationsEnabled) {
      // Request permission
      const granted = await browserNotificationService.requestBrowserNotificationPermission();
      if (granted === 'granted') {
        const updated = { browserNotificationsEnabled: true };
        setLocalPreferences({ ...localPreferences, ...updated });
        updatePreferences(updated);
      } else {
        log.notification.warn('Browser notification permission denied');
      }
    } else {
      // Disable
      const updated = { browserNotificationsEnabled: false };
      setLocalPreferences({ ...localPreferences, ...updated });
      updatePreferences(updated);
    }
  };

  // Handle notification type toggles
  const handleNotificationTypeToggle = (
    key: 'enableMessageNotifications' | 'enableMentionNotifications' |
         'enableReactionNotifications' | 'enableMemberActivityNotifications'
  ) => {
    if (!localPreferences) return;
    const updated = { [key]: !localPreferences[key] };
    setLocalPreferences({ ...localPreferences, ...updated as Partial<NotificationPreferences> });
    updatePreferences(updated);
  };

  // Handle DND toggle
  const handleDndToggle = () => {
    if (!localPreferences) return;
    const updated = { dndEnabled: !localPreferences.dndEnabled };
    setLocalPreferences({ ...localPreferences, ...updated });
    updatePreferences(updated);
  };

  // Handle DND time change
  const handleDndTimeChange = (key: 'dndStart' | 'dndEnd', value: string) => {
    if (!localPreferences) return;
    const updated = { [key]: value };
    setLocalPreferences({ ...localPreferences, ...updated as Partial<NotificationPreferences> });
    updatePreferences(updated);
  };

  // Handle unmute conversation
  const handleUnmute = (conversationId: string) => {
    unmuteConversation(conversationId);
  };

  if (isLoading || !localPreferences) {
    return (
      <Card className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-viber-purple mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Loading notification settings...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 dark:text-dark-text">Notification Settings</h3>

      {/* Sound Section */}
      <div className="space-y-4 mb-6">
        <Label className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">Sound</Label>

        {/* Enable Sound */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {localPreferences.soundEnabled ? (
              <Volume2 className="w-5 h-5 text-viber-purple" />
            ) : (
              <VolumeX className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary" />
            )}
            <div>
              <p className="text-sm font-medium dark:text-dark-text">Enable Sound</p>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">Play notification sounds</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSoundToggle}
            disabled={isUpdatingPreferences}
            className={localPreferences.soundEnabled ? 'border-viber-purple text-viber-purple' : ''}
          >
            {localPreferences.soundEnabled ? 'On' : 'Off'}
          </Button>
        </div>

        {/* Volume Slider */}
        {localPreferences.soundEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-600 dark:text-dark-text-secondary">Volume</Label>
              <span className="text-xs font-medium text-viber-purple">{localPreferences.soundVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={localPreferences.soundVolume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              onMouseUp={(e) => handleVolumeChangeComplete(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleVolumeChangeComplete(Number((e.target as HTMLInputElement).value))}
              disabled={isUpdatingPreferences}
              className="w-full h-2 bg-gray-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-viber-purple [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-viber-purple
                [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        )}
      </div>

      <Separator className="my-6" />

      {/* Browser Notifications Section */}
      <div className="space-y-4 mb-6">
        <Label className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">Browser Notifications</Label>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {localPreferences.browserNotificationsEnabled ? (
              <Bell className="w-5 h-5 text-viber-purple" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary" />
            )}
            <div>
              <p className="text-sm font-medium dark:text-dark-text">Enable Browser Notifications</p>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">Show desktop notifications when app is in background</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBrowserNotificationsToggle}
            disabled={isUpdatingPreferences}
            className={localPreferences.browserNotificationsEnabled ? 'border-viber-purple text-viber-purple' : ''}
          >
            {localPreferences.browserNotificationsEnabled ? 'On' : 'Off'}
          </Button>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Notification Types Section */}
      <div className="space-y-4 mb-6">
        <Label className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">Notification Types</Label>

        {/* Messages */}
        <button
          onClick={() => handleNotificationTypeToggle('enableMessageNotifications')}
          disabled={isUpdatingPreferences}
          className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            {localPreferences.enableMessageNotifications ? (
              <CheckSquare className="w-5 h-5 text-viber-purple" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium dark:text-dark-text">New Messages</p>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">Notify when you receive new messages</p>
            </div>
          </div>
        </button>

        {/* Mentions */}
        <button
          onClick={() => handleNotificationTypeToggle('enableMentionNotifications')}
          disabled={isUpdatingPreferences}
          className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            {localPreferences.enableMentionNotifications ? (
              <CheckSquare className="w-5 h-5 text-viber-purple" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium dark:text-dark-text">@Mentions</p>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">Notify when someone mentions you</p>
            </div>
          </div>
        </button>

        {/* Reactions */}
        <button
          onClick={() => handleNotificationTypeToggle('enableReactionNotifications')}
          disabled={isUpdatingPreferences}
          className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            {localPreferences.enableReactionNotifications ? (
              <CheckSquare className="w-5 h-5 text-viber-purple" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium dark:text-dark-text">Reactions</p>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">Notify when someone reacts to your messages</p>
            </div>
          </div>
        </button>

        {/* Member Activity */}
        <button
          onClick={() => handleNotificationTypeToggle('enableMemberActivityNotifications')}
          disabled={isUpdatingPreferences}
          className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            {localPreferences.enableMemberActivityNotifications ? (
              <CheckSquare className="w-5 h-5 text-viber-purple" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium dark:text-dark-text">Member Activity</p>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">Notify when members join or leave</p>
            </div>
          </div>
        </button>
      </div>

      <Separator className="my-6" />

      {/* Do Not Disturb Section */}
      <div className="space-y-4 mb-6">
        <Label className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">Do Not Disturb</Label>

        {/* Enable DND */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Moon className={`w-5 h-5 ${localPreferences.dndEnabled ? 'text-viber-purple' : 'text-gray-400'}`} />
            <div>
              <p className="text-sm font-medium dark:text-dark-text">Enable Do Not Disturb</p>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">Silence notifications during specified hours (except @mentions)</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDndToggle}
            disabled={isUpdatingPreferences}
            className={localPreferences.dndEnabled ? 'border-viber-purple text-viber-purple' : ''}
          >
            {localPreferences.dndEnabled ? 'On' : 'Off'}
          </Button>
        </div>

        {/* DND Schedule */}
        {localPreferences.dndEnabled && (
          <div className="grid grid-cols-2 gap-4 pl-8">
            <div className="space-y-2">
              <Label className="text-xs text-gray-600 dark:text-dark-text-secondary">Start Time</Label>
              <Input
                type="time"
                value={localPreferences.dndStart || '22:00'}
                onChange={(e) => handleDndTimeChange('dndStart', e.target.value)}
                disabled={isUpdatingPreferences}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-600 dark:text-dark-text-secondary">End Time</Label>
              <Input
                type="time"
                value={localPreferences.dndEnd || '08:00'}
                onChange={(e) => handleDndTimeChange('dndEnd', e.target.value)}
                disabled={isUpdatingPreferences}
                className="text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <Separator className="my-6" />

      {/* Muted Conversations Section */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
          Muted Conversations ({mutedConversations?.length || 0})
        </Label>

        {mutedConversations && mutedConversations.length > 0 ? (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {mutedConversations.map((conversationId) => (
              <div
                key={conversationId}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-border rounded-lg"
              >
                <p className="text-sm text-gray-700 dark:text-dark-text-secondary font-mono text-xs">{conversationId}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnmute(conversationId)}
                  disabled={isUnmutingConversation}
                  className="text-viber-purple hover:text-viber-purple-dark"
                >
                  <X className="w-4 h-4 mr-1" />
                  Unmute
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-dark-text-secondary italic">No muted conversations</p>
        )}
      </div>

      {isUpdatingPreferences && (
        <p className="text-xs text-gray-500 dark:text-dark-text-secondary text-center mt-4">Saving changes...</p>
      )}
    </Card>
  );
}
