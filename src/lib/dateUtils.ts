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
 * @param timestamp - ISO string or Date object
 * @returns Date object in local timezone
 */
export const parseTimestamp = (timestamp: string | Date): Date => {
  if (timestamp instanceof Date) return timestamp;

  try {
    // new Date() automatically converts ISO UTC strings to local timezone
    return new Date(timestamp);
  } catch {
    // Fallback to current time if parsing fails
    return new Date();
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
 * Returns human-readable date labels
 *
 * Format logic:
 * - Today: "Today"
 * - Yesterday: "Yesterday"
 * - Other: "MMMM dd, yyyy" (e.g., "December 15, 2024")
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

    return format(date, 'MMMM dd, yyyy'); // e.g., "December 15, 2024"
  } catch {
    return 'Unknown date';
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
