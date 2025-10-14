/**
 * Message Service
 * Handles all message-related API calls
 */

import { apiClient } from '@/lib/apiClient';
import type {
  Message,
  SendMessageRequest,
  EditMessageRequest,
  AddReactionRequest,
  MarkMessagesReadRequest,
  SearchMessagesRequest,
  MessageListResponse,
  UnreadCountResponse,
  MessageReaction,
} from '@/types/message';

const BASE_PATH = '/api/v1/messages';

/**
 * Send a new message
 */
export async function sendMessage(data: SendMessageRequest): Promise<Message> {
  return apiClient.post<Message>(`${BASE_PATH}/`, data);
}

/**
 * Get a message by ID
 */
export async function getMessageById(messageId: string): Promise<Message> {
  return apiClient.get<Message>(`${BASE_PATH}/${messageId}`);
}

/**
 * Edit a message
 */
export async function editMessage(
  messageId: string,
  data: EditMessageRequest
): Promise<Message> {
  return apiClient.put<Message>(`${BASE_PATH}/${messageId}`, data);
}

/**
 * Delete a message
 */
export async function deleteMessage(messageId: string): Promise<void> {
  return apiClient.delete<void>(`${BASE_PATH}/${messageId}`);
}

/**
 * Add a reaction to a message
 */
export async function addReaction(
  messageId: string,
  data: AddReactionRequest
): Promise<MessageReaction> {
  return apiClient.post<MessageReaction>(
    `${BASE_PATH}/${messageId}/reactions`,
    data
  );
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  return apiClient.delete<void>(`${BASE_PATH}/${messageId}/reactions/${emoji}`);
}

/**
 * Get conversation messages with pagination
 */
export async function getConversationMessages(
  conversationId: string,
  params?: {
    limit?: number;
    offset?: number;
    before?: string;
    after?: string;
  }
): Promise<MessageListResponse> {
  return apiClient.get<MessageListResponse>(
    `${BASE_PATH}/conversations/${conversationId}/messages`,
    params
  );
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  data: MarkMessagesReadRequest
): Promise<void> {
  return apiClient.post<void>(`${BASE_PATH}/mark-read`, data);
}

/**
 * Get unread message count for a conversation
 */
export async function getConversationUnreadCount(
  conversationId: string
): Promise<UnreadCountResponse> {
  return apiClient.get<UnreadCountResponse>(
    `${BASE_PATH}/conversations/${conversationId}/unread-count`
  );
}

/**
 * Get total unread message count
 */
export async function getTotalUnreadCount(): Promise<UnreadCountResponse> {
  return apiClient.get<UnreadCountResponse>(`${BASE_PATH}/unread-count`);
}

/**
 * Search messages
 */
export async function searchMessages(
  data: SearchMessagesRequest
): Promise<MessageListResponse> {
  return apiClient.post<MessageListResponse>(`${BASE_PATH}/search`, data);
}

// Export all functions as a service object
export const messageService = {
  sendMessage,
  getMessageById,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  getConversationMessages,
  markMessagesAsRead,
  getConversationUnreadCount,
  getTotalUnreadCount,
  searchMessages,
};

export default messageService;
