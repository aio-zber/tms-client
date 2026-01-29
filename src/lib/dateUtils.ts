/**
 * Centralized date/time utilities for TMS Client
 * Ensures consistent timestamp formatting and proper timezone handling across the app
 *
 * References: Messenger and Telegram timestamp patterns
 */

import {
  format,
  isToday,
  isYesterday,
  isThisWeek,
  isThisYear,
} from 'date-fns';

/**
 * Safely parse timestamp to local Date object
 * Handles both ISO strings (UTC) and Date objects
 * Automatically converts UTC to device local timezone
 *
 * IMPORTANT: Ensures naive timestamps (without 'Z') are interpreted as UTC
 * by appending 'Z' suffix. This fixes the root cause of message ordering issues.
 *
 * @param timestamp - ISO string or Date object
 * @returns Date object in local timezone
 * @throws Error if timestamp is invalid (allows caller to handle corruption)
 */
export const parseTimestamp = (timestamp: string | Date): Date => {
  if (timestamp instanceof Date) return timestamp;

  try {
    let isoString = timestamp.trim();

    // If naive timestamp (no 'Z' or timezone offset), append 'Z' to treat as UTC
    // This prevents JavaScript from interpreting it as local time
    if (
      !isoString.endsWith('Z') &&
      !isoString.includes('+') &&
      !isoString.includes('-', 10) // Check for '-' after position 10 to avoid matching date separators
    ) {
      isoString += 'Z';
    }

    const date = new Date(isoString);

    // Validate parsed date
    if (isNaN(date.getTime())) {
      console.error('[dateUtils] Invalid timestamp:', timestamp);
      throw new Error('Invalid timestamp');
    }

    return date;
  } catch (error) {
    console.error('[dateUtils] Failed to parse timestamp:', timestamp, error);
    // DO NOT fallback to current time - throw error to catch corruption
    // This helps identify data integrity issues
    throw error;
  }
};

/**
 * Get current UTC timestamp as ISO string with 'Z' suffix
 * Use this for creating new timestamps (e.g., optimistic updates)
 *
 * @returns ISO 8601 string with 'Z' suffix (e.g., "2025-12-16T11:30:00.123Z")
 */
export const nowUTC = (): string => {
  return new Date().toISOString(); // Always includes 'Z'
};

/**
 * Validate and normalize timestamp from API
 *
 * @param timestamp - ISO string from API (may be null/undefined)
 * @param context - Context string for debugging (e.g., "MessageList")
 * @returns Validated Date object in local timezone
 * @throws Error if timestamp is missing or invalid
 */
export const validateTimestamp = (
  timestamp: string | undefined | null,
  context: string
): Date => {
  if (!timestamp) {
    throw new Error(`[${context}] Missing timestamp`);
  }

  try {
    return parseTimestamp(timestamp);
  } catch (error) {
    console.error(`[${context}] Invalid timestamp:`, timestamp, error);
    throw new Error(`[${context}] Invalid timestamp: ${timestamp}`);
  }
};

/**
 * Format timestamp for message bubbles
 * Returns 24-hour time format (HH:mm)
 *
 * Used in: MessageBubble.tsx, Message.tsx
 *
 * @param timestamp - ISO string or Date object
 * @returns Time in "HH:mm" format (e.g., "14:23")
 */
export const formatMessageTimestamp = (timestamp: string | Date): string => {
  try {
    const date = parseTimestamp(timestamp);
    return format(date, 'HH:mm');
  } catch {
    return '';
  }
};

/**
 * Format timestamp for conversation sidebar (compact, intelligent format)
 * Prevents text overflow with max 9 characters
 *
 * Format logic:
 * - Today: "HH:mm" (e.g., "14:23")
 * - Yesterday: "Yesterday"
 * - This week: Day name (e.g., "Monday")
 * - This year: "MMM dd" (e.g., "Dec 15")
 * - Older: "dd/MM/yy" (e.g., "15/12/24")
 *
 * Used in: ConversationList.tsx, ConversationListItem.tsx
 *
 * @param timestamp - ISO string or Date object
 * @returns Formatted string (max 9 chars)
 */
export const formatSidebarTimestamp = (timestamp: string | Date): string => {
  try {
    const date = parseTimestamp(timestamp);

    if (isToday(date)) {
      return format(date, 'HH:mm');
    }

    if (isYesterday(date)) {
      return 'Yesterday';
    }

    if (isThisWeek(date)) {
      return format(date, 'EEEE'); // Day name (e.g., "Monday")
    }

    if (isThisYear(date)) {
      return format(date, 'MMM dd'); // e.g., "Dec 15"
    }

    return format(date, 'dd/MM/yy'); // e.g., "15/12/24"
  } catch {
    return '';
  }
};

/**
 * Format timestamp for compact relative time display (Telegram style)
 * Returns condensed format for recent times
 *
 * Format logic:
 * - < 1 minute: "now"
 * - < 1 hour: "Xm" (e.g., "5m")
 * - < 24 hours: "Xh" (e.g., "8h")
 * - < 7 days: "Xd" (e.g., "3d")
 * - Older: Falls back to formatSidebarTimestamp
 *
 * Used in: NotificationCenter.tsx, PollDisplay.tsx
 *
 * @param timestamp - ISO string or Date object
 * @returns Compact relative time (e.g., "2m", "5h", "2d")
 */
export const formatRelativeTime = (timestamp: string | Date): string => {
  try {
    const date = parseTimestamp(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;

    // Fallback to sidebar format for older dates
    return formatSidebarTimestamp(timestamp);
  } catch {
    return '';
  }
};

/**
 * Format timestamp for date separators in message list
 * Messenger-style: includes day of week for context
 *
 * Format logic:
 * - Today: "Today"
 * - Yesterday: "Yesterday"
 * - This week: "EEEE" (e.g., "Monday")
 * - This year: "EEEE, MMMM dd" (e.g., "Monday, August 18")
 * - Older: "EEEE, MMMM dd, yyyy" (e.g., "Monday, August 18, 2025")
 *
 * Used in: MessageList.tsx
 *
 * @param timestamp - ISO string or Date object
 * @returns Date label string
 */
export const formatDateSeparator = (timestamp: string | Date): string => {
  try {
    const date = parseTimestamp(timestamp);

    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    if (isThisWeek(date)) return format(date, 'EEEE'); // e.g., "Monday"
    if (isThisYear(date)) return format(date, 'EEEE, MMMM dd'); // e.g., "Monday, August 18"

    return format(date, 'EEEE, MMMM dd, yyyy'); // e.g., "Monday, August 18, 2025"
  } catch {
    return 'Unknown date';
  }
};

/**
 * Format timestamp for inline time separators between messages
 * Messenger-style: a single label with enough date+time context
 *
 * No separate date pill — the time separator IS the date context.
 *
 * Format logic (matches Messenger exactly):
 * - Today: "h:mm a" (e.g., "8:26 AM")
 * - This week (incl. yesterday): "EEE h:mm a" (e.g., "Tue 8:50 PM")
 * - This year: "MMM dd, h:mm a" (e.g., "Aug 18, 7:59 PM")
 * - Older: "MMM dd, yyyy, h:mm a" (e.g., "Jan 18, 2026, 1:15 PM")
 *
 * Used in: MessageList.tsx
 *
 * @param timestamp - ISO string or Date object
 * @returns Formatted time separator string
 */
export const formatTimeSeparator = (timestamp: string | Date): string => {
  try {
    const date = parseTimestamp(timestamp);

    if (isToday(date)) return format(date, 'h:mm a');
    if (isThisWeek(date) || isYesterday(date)) return format(date, 'EEE h:mm a');
    if (isThisYear(date)) return format(date, 'MMM dd, h:mm a');

    return format(date, 'MMM dd, yyyy, h:mm a');
  } catch {
    return '';
  }
};

/**
 * Format timestamp for detailed views and tooltips
 * Returns full date and time
 *
 * Used in: Various components for detailed timestamp display
 *
 * @param timestamp - ISO string or Date object
 * @returns Full timestamp (e.g., "Dec 15, 2024 at 14:23")
 */
export const formatLongTimestamp = (timestamp: string | Date): string => {
  try {
    const date = parseTimestamp(timestamp);
    return format(date, "MMM dd, yyyy 'at' HH:mm");
  } catch {
    return '';
  }
};
