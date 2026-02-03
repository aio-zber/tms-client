/**
 * Conversation Service
 * Handles all conversation-related API calls
 */

import { apiClient } from '@/lib/apiClient';
import type {
  Conversation,
  CreateConversationRequest,
  UpdateConversationRequest,
  AddMembersRequest,
  UpdateConversationSettingsRequest,
  ConversationListResponse,
} from '@/types/conversation';

const BASE_PATH = '/conversations';

/**
 * Create a new conversation
 */
export async function createConversation(
  data: CreateConversationRequest
): Promise<Conversation> {
  return apiClient.post<Conversation>(`${BASE_PATH}/`, data);
}

/**
 * Get user's conversations
 */
export async function getConversations(params?: {
  limit?: number;
  offset?: number;
  type?: 'dm' | 'group';
}): Promise<ConversationListResponse> {
  return apiClient.get<ConversationListResponse>(`${BASE_PATH}/`, params);
}

/**
 * Get a conversation by ID
 */
export async function getConversationById(
  conversationId: string
): Promise<Conversation> {
  return apiClient.get<Conversation>(`${BASE_PATH}/${conversationId}`);
}

/**
 * Update conversation details
 */
export async function updateConversation(
  conversationId: string,
  data: UpdateConversationRequest
): Promise<Conversation> {
  return apiClient.put<Conversation>(`${BASE_PATH}/${conversationId}`, data);
}

/**
 * Add members to conversation
 */
export async function addMembers(
  conversationId: string,
  data: AddMembersRequest
): Promise<Conversation> {
  return apiClient.post<Conversation>(
    `${BASE_PATH}/${conversationId}/members`,
    data
  );
}

/**
 * Remove a member from conversation
 */
export async function removeMember(
  conversationId: string,
  memberId: string
): Promise<void> {
  return apiClient.delete<void>(
    `${BASE_PATH}/${conversationId}/members/${memberId}`
  );
}

/**
 * Leave a conversation
 */
export async function leaveConversation(conversationId: string): Promise<void> {
  return apiClient.post<void>(`${BASE_PATH}/${conversationId}/leave`);
}

/**
 * Update conversation settings
 */
export async function updateConversationSettings(
  conversationId: string,
  data: UpdateConversationSettingsRequest
): Promise<Conversation> {
  return apiClient.put<Conversation>(
    `${BASE_PATH}/${conversationId}/settings`,
    data
  );
}

/**
 * Mark conversation as read
 */
export async function markConversationAsRead(
  conversationId: string
): Promise<void> {
  return apiClient.post<void>(`${BASE_PATH}/${conversationId}/mark-read`);
}

/**
 * Search conversations by name or member names
 * Implements Telegram/Messenger-style fuzzy search
 */
export async function searchConversations(params: {
  q: string;
  limit?: number;
}): Promise<ConversationListResponse> {
  return apiClient.get<ConversationListResponse>(`${BASE_PATH}/search`, params);
}

/**
 * Upload avatar for a group conversation
 */
export async function uploadConversationAvatar(
  conversationId: string,
  file: File
): Promise<Conversation> {
  return apiClient.uploadFile<Conversation>(
    `${BASE_PATH}/${conversationId}/avatar`,
    file
  );
}

// Export all functions as a service object
export const conversationService = {
  createConversation,
  getConversations,
  getConversationById,
  updateConversation,
  addMembers,
  removeMember,
  leaveConversation,
  updateConversationSettings,
  markConversationAsRead,
  searchConversations,
  uploadConversationAvatar,
};

export default conversationService;
