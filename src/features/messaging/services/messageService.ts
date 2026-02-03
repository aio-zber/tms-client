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
  MarkMessagesDeliveredRequest,
  SearchMessagesRequest,
  MessageListResponse,
  UnreadCountResponse,
  MessageReaction,
} from '@/types/message';

const BASE_PATH = '/messages';

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
 * Delete a message (Messenger-style)
 * @param messageId - ID of the message to delete
 * @param deleteForEveryone - If true, delete for all users (sender only). If false, delete only for yourself.
 */
export async function deleteMessage(
  messageId: string,
  deleteForEveryone: boolean = false
): Promise<void> {
  return apiClient.delete<void>(`${BASE_PATH}/${messageId}`, {
    delete_for_everyone: deleteForEveryone
  });
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
    cursor?: string;
  }
): Promise<MessageListResponse> {
  const queryParams: Record<string, string | number> = {
    limit: params?.limit || 50,
  };

  if (params?.cursor) {
    queryParams.cursor = params.cursor;
  }

  return apiClient.get<MessageListResponse>(
    `${BASE_PATH}/conversations/${conversationId}/messages`,
    queryParams
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
 * Mark messages as delivered (Telegram/Messenger pattern)
 * Automatically called when user opens a conversation
 */
export async function markMessagesAsDelivered(
  data: MarkMessagesDeliveredRequest
): Promise<void> {
  return apiClient.post<void>(`${BASE_PATH}/mark-delivered`, data);
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

/**
 * Clear all messages in a conversation
 */
export async function clearConversation(conversationId: string): Promise<{ success: boolean; deleted_count: number }> {
  return apiClient.delete<{ success: boolean; deleted_count: number }>(
    `${BASE_PATH}/conversations/${conversationId}/clear`
  );
}

/**
 * Send a file message (image, video, document, audio)
 * Uses XMLHttpRequest for upload progress tracking
 */
export async function sendFileMessage(params: {
  conversationId: string;
  file: File;
  replyToId?: string;
  onProgress?: (progress: number) => void;
}): Promise<Message> {
  const { conversationId, file, replyToId, onProgress } = params;

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversation_id', conversationId);
    if (replyToId) {
      formData.append('reply_to_id', replyToId);
    }

    const xhr = new XMLHttpRequest();

    // Upload progress tracking
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    // Upload complete
    xhr.addEventListener('load', () => {
      if (xhr.status === 201 || xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (parseError) {
          reject(new Error('Failed to parse response'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || `Upload failed: ${xhr.statusText}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      }
    });

    // Upload error
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    // Upload aborted
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'));
    });

    // Get the API base URL from apiClient
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    xhr.open('POST', `${baseUrl}${BASE_PATH}/upload`);

    // Add auth header
    const token = localStorage.getItem('auth_token');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    // Send the request
    xhr.send(formData);
  });
}

/**
 * Send a voice message
 * Wrapper around sendFileMessage with duration metadata
 */
export async function sendVoiceMessage(params: {
  conversationId: string;
  audioFile: File;
  duration: number;
  replyToId?: string;
  onProgress?: (progress: number) => void;
}): Promise<Message> {
  const { conversationId, audioFile, duration, replyToId, onProgress } = params;

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('conversation_id', conversationId);
    formData.append('duration', duration.toString());
    if (replyToId) {
      formData.append('reply_to_id', replyToId);
    }

    const xhr = new XMLHttpRequest();

    // Upload progress tracking
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    // Upload complete
    xhr.addEventListener('load', () => {
      if (xhr.status === 201 || xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (parseError) {
          reject(new Error('Failed to parse response'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || `Upload failed: ${xhr.statusText}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      }
    });

    // Upload error
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    // Get the API base URL
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    xhr.open('POST', `${baseUrl}${BASE_PATH}/upload`);

    // Add auth header
    const token = localStorage.getItem('auth_token');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    // Send the request
    xhr.send(formData);
  });
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
  markMessagesAsDelivered,
  getConversationUnreadCount,
  getTotalUnreadCount,
  searchMessages,
  clearConversation,
  sendFileMessage,
  sendVoiceMessage,
};

export default messageService;
