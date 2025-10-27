/**
 * Poll Service
 * Handles all poll-related API calls
 */

import { apiClient } from '@/lib/apiClient';
import type { Poll } from '@/types/message';

const BASE_PATH = '/polls';

export interface CreatePollRequest {
  conversation_id: string;
  question: string;
  options: Array<{
    option_text: string;
    position: number;
  }>;
  multiple_choice?: boolean;
  expires_at?: string;
}

export interface VoteOnPollRequest {
  option_ids: string[];
}

export interface CreatePollResponse {
  poll: Poll;
  message: {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    type: string;
    created_at: string;
  };
}

export interface VoteOnPollResponse {
  success: boolean;
  poll: Poll;
  message: string;
}

/**
 * Create a new poll
 */
export async function createPoll(data: CreatePollRequest): Promise<CreatePollResponse> {
  return apiClient.post<CreatePollResponse>(`${BASE_PATH}/`, data);
}

/**
 * Vote on a poll
 */
export async function voteOnPoll(
  pollId: string,
  data: VoteOnPollRequest
): Promise<VoteOnPollResponse> {
  return apiClient.post<VoteOnPollResponse>(`${BASE_PATH}/${pollId}/vote`, data);
}

/**
 * Close a poll (only creator can close)
 */
export async function closePoll(pollId: string): Promise<Poll> {
  return apiClient.put<Poll>(`${BASE_PATH}/${pollId}/close`, {});
}

/**
 * Get poll details and results
 */
export async function getPoll(pollId: string): Promise<Poll> {
  return apiClient.get<Poll>(`${BASE_PATH}/${pollId}`);
}

// Export all functions as a service object
export const pollService = {
  createPoll,
  voteOnPoll,
  closePoll,
  getPoll,
};

export default pollService;
