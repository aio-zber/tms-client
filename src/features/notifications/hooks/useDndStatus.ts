/**
 * useDndStatus Hook
 * Calculates if current time is within DND schedule
 */

import { useMemo } from 'react';
import type { NotificationPreferences } from '../types';

/**
 * Check if current time is within DND schedule
 */
export function useDndStatus(preferences: NotificationPreferences): boolean {
  return useMemo(() => {
    if (!preferences.dndEnabled) return false;
    if (!preferences.dndStart || !preferences.dndEnd) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Parse DND start and end times (format: "HH:MM")
    const [startHour, startMinute] = preferences.dndStart.split(':').map(Number);
    const [endHour, endMinute] = preferences.dndEnd.split(':').map(Number);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // Handle overnight DND (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      // Current time is after start OR before end
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // Normal DND (e.g., 08:00 - 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }, [preferences.dndEnabled, preferences.dndStart, preferences.dndEnd]);
}

/**
 * Check if DND is active (helper function for non-hook usage)
 */
export function checkDndActive(preferences: NotificationPreferences): boolean {
  if (!preferences.dndEnabled) return false;
  if (!preferences.dndStart || !preferences.dndEnd) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Parse DND start and end times (format: "HH:MM")
  const [startHour, startMinute] = preferences.dndStart.split(':').map(Number);
  const [endHour, endMinute] = preferences.dndEnd.split(':').map(Number);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  // Handle overnight DND (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  // Normal DND (e.g., 08:00 - 17:00)
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
