/**
 * Call-related type definitions
 */

export type CallType = 'voice' | 'video';

export type CallStatus = 'ringing' | 'active' | 'completed' | 'missed' | 'declined' | 'cancelled';

export interface Call {
  id: string;
  conversationId: string;
  type: CallType;
  status: CallStatus;
  participants: CallParticipant[];
  startedBy: string;
  startedAt?: string;
  endedAt?: string;
  duration?: number; // in seconds
}

export interface CallParticipant {
  userId: string;
  joinedAt?: string;
  leftAt?: string;
  isMuted: boolean;
  isVideoEnabled: boolean;
}

export interface CallSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  data: unknown; // WebRTC signal data
}
