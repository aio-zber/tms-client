/**
 * Notification Service
 * Handles all notification-related API calls
 * Pattern: Follows messageService.ts - Axios client with error handling
 */

import { apiClient } from '@/lib/apiClient';
import type {
  NotificationPreferences,
  NotificationPreferencesResponse,
  NotificationPreferencesUpdate,
} from '../types';

const BASE_PATH = '/notifications';

/**
 * Get user's notification preferences
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await apiClient.get<NotificationPreferencesResponse>(
    `${BASE_PATH}/preferences`
  );
  return response.data;
}

/**
 * Update user's notification preferences
 */
export async function updateNotificationPreferences(
  preferences: NotificationPreferencesUpdate
): Promise<NotificationPreferences> {
  const response = await apiClient.put<NotificationPreferencesResponse>(
    `${BASE_PATH}/preferences`,
    preferences
  );
  return response.data;
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
  const response = await apiClient.get<{ data: string[] }>(`${BASE_PATH}/muted-conversations`);
  return response.data;
}

export const notificationService = {
  getNotificationPreferences,
  updateNotificationPreferences,
  muteConversation,
  unmuteConversation,
  getMutedConversations,
};
