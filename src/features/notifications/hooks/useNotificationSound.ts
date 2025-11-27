/**
 * useNotificationSound Hook
 * Plays notification sound with volume control and rate limiting
 */

import { useCallback, useRef } from 'react';
import type { NotificationPreferences } from '../types';
import { checkDndActive } from './useDndStatus';
import { log } from '@/lib/logger';

// Rate limiting: Max 1 sound per 2 seconds
const SOUND_RATE_LIMIT_MS = 2000;

/**
 * Hook for playing notification sounds
 */
export function useNotificationSound(preferences: NotificationPreferences) {
  const lastPlayedRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * Play notification sound
   * Uses default browser notification sound (data URI or system sound)
   */
  const playSound = useCallback(() => {
    // Check if sound is enabled
    if (!preferences.soundEnabled) {
      return;
    }

    // Check DND mode
    if (checkDndActive(preferences)) {
      log.notification.debug('DND active - skipping sound');
      return;
    }

    // Check rate limit
    const now = Date.now();
    if (now - lastPlayedRef.current < SOUND_RATE_LIMIT_MS) {
      log.notification.debug('Sound rate limit - skipping');
      return;
    }

    try {
      // Use default browser notification sound (simple beep)
      // We use a data URI for a short beep sound to avoid external files
      if (!audioRef.current) {
        audioRef.current = new Audio(
          'data:audio/wav;base64,UklGRigBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQBAAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA'
        );
      }

      // Set volume (0-1 range)
      audioRef.current.volume = (preferences.soundVolume || 75) / 100;

      // Play sound
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            log.notification.debug('Sound played successfully');
            lastPlayedRef.current = now;
          })
          .catch((error) => {
            // Autoplay was prevented (common in browsers)
            log.notification.warn('Sound play prevented:', error);
          });
      }
    } catch (error) {
      log.notification.error('Failed to play notification sound:', error);
    }
  }, [preferences]);

  return { playSound };
}
