/**
 * Notification Service
 * Handles all notification-related API calls
 * Pattern: Follows messageService.ts - Axios client with error handling
 */

import { apiClient } from '@/lib/apiClient';
import type {
  NotificationPreferences,
  NotificationPreferencesUpdate,
} from '../types';

const BASE_PATH = '/notifications';

/**
 * Convert snake_case to camelCase
 */
function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

/**
 * Get user's notification preferences
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await apiClient.get<Record<string, unknown>>(
    `${BASE_PATH}/preferences`
  );
  return toCamelCase(response) as unknown as NotificationPreferences;
}

/**
 * Update user's notification preferences
 */
export async function updateNotificationPreferences(
  preferences: NotificationPreferencesUpdate
): Promise<NotificationPreferences> {
  const snakeCasePrefs = toSnakeCase(preferences as Record<string, unknown>);
  const response = await apiClient.put<Record<string, unknown>>(
    `${BASE_PATH}/preferences`,
    snakeCasePrefs
  );
  return toCamelCase(response) as unknown as NotificationPreferences;
}

/**
 * Mute a conversation
 */
export async function muteConversation(conversationId: string): Promise<void> {
  await apiClient.post<void>(`/conversations/${conversationId}/mute`);
}

/**
 * Unmute a conversation
 */
export async function unmuteConversation(conversationId: string): Promise<void> {
  await apiClient.delete<void>(`/conversations/${conversationId}/mute`);
}

/**
 * Get list of muted conversations
 */
export async function getMutedConversations(): Promise<string[]> {
  const response = await apiClient.get<{ muted_conversations: Array<{ conversation_id: string }>, total: number }>(`${BASE_PATH}/muted-conversations`);
  return response.muted_conversations.map((mc: { conversation_id: string }) => mc.conversation_id);
}

export const notificationService = {
  getNotificationPreferences,
  updateNotificationPreferences,
  muteConversation,
  unmuteConversation,
  getMutedConversations,
};
