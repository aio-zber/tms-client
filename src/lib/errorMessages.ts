/**
 * Error Message Utility
 * Maps error codes to user-friendly, actionable messages
 * Follows Messenger/Telegram patterns for clear error communication
 */

interface ApiError {
  statusCode?: number;
  message?: string;
}

/**
 * Get user-friendly error message based on error type and context
 * @param error - The error object (usually from API client)
 * @param context - Human-readable context of the operation (e.g., "vote on poll")
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown, context: string): string {
  const apiError = error as ApiError;

  // Network errors - check if browser is offline
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return "Check your internet connection and try again";
  }

  // Map HTTP status codes to user-friendly messages
  switch (apiError.statusCode) {
    case 400:
      return `Invalid ${context}. Please check your input`;

    case 403:
      return `You don't have permission to ${context}`;

    case 404:
      return `${context.charAt(0).toUpperCase() + context.slice(1)} not found. It may have been deleted`;

    case 409:
      return `This ${context} conflicts with existing data`;

    case 429:
      return "You're doing that too fast. Please wait a moment";

    case 500:
    case 502:
    case 503:
      return "Server error. Please try again in a moment";

    case 504:
      return "Request timed out. Please try again";

    default:
      // Include backend message if available and meaningful
      if (apiError.message && apiError.message.length < 100) {
        return apiError.message;
      }
      return `Failed to ${context}. Please try again`;
  }
}

/**
 * Predefined operation contexts for consistent error messaging
 */
export const ERROR_CONTEXTS = {
  // Poll operations
  POLL_VOTE: 'vote on poll',
  POLL_CLOSE: 'close poll',
  POLL_CREATE: 'create poll',

  // Conversation operations
  CONVERSATION_CREATE: 'create conversation',
  CONVERSATION_UPDATE: 'update conversation',
  CONVERSATION_DELETE: 'delete conversation',

  // Member operations
  MEMBER_ADD: 'add members',
  MEMBER_REMOVE: 'remove member',
  MEMBER_LEAVE: 'leave conversation',

  // Settings operations
  CONVERSATION_SETTINGS: 'update settings',
  NOTIFICATION_SETTINGS: 'update notification settings',

  // Message operations
  MESSAGE_SEND: 'send message',
  MESSAGE_EDIT: 'edit message',
  MESSAGE_DELETE: 'delete message',
  MESSAGE_REACT: 'react to message',

  // Call operations
  CALL_START: 'start call',
  CALL_JOIN: 'join call',
  CALL_END: 'end call',
} as const;

/**
 * Type for error context values
 */
export type ErrorContext = typeof ERROR_CONTEXTS[keyof typeof ERROR_CONTEXTS];
