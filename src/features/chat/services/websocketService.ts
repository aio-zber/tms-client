/**
 * WebSocket Service
 * Manages Socket.IO connection for real-time messaging
 */

import { io, Socket } from 'socket.io-client';
import { WS_URL } from '@/lib/constants';
import { authService } from '@/features/auth/services/authService';

export interface WebSocketMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  type: string;
  created_at: string;
  is_edited: boolean;
  sender_name?: string;
  sender_avatar?: string;
  reactions?: Array<{ user_id: string; emoji: string; }>;
  [key: string]: unknown;
}

export interface TypingIndicator {
  conversation_id: string;
  user_id: string;
  user_name: string;
  is_typing: boolean;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket?.connected || this.isConnecting) {
      console.log('WebSocket already connected or connecting');
      return;
    }

    this.isConnecting = true;
    const token = authService.getStoredToken();

    if (!token) {
      console.error('No auth token available for WebSocket connection');
      this.isConnecting = false;
      return;
    }

    console.log('[WebSocket] Connecting to:', WS_URL);
    console.log('[WebSocket] Path: /socket.io');
    console.log('[WebSocket] Full URL:', `${WS_URL}/socket.io/`);

    this.socket = io(WS_URL, {
      path: '/socket.io',  // FIXED: Socket.IO default path (server wraps FastAPI with socketio.ASGIApp)
      auth: { token },
      transports: ['websocket'],  // WebSocket-only for Railway (polling doesn't work well)
      upgrade: false,  // Don't upgrade from polling to WebSocket
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,  // Increased timeout for Railway
      autoConnect: true,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected:', this.socket?.id);
      this.isConnecting = false;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.isConnecting = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.isConnecting = false;
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.disconnect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  /**
   * Join a conversation room
   */
  joinConversation(conversationId: string): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot join conversation');
      return;
    }

    console.log('Joining conversation:', conversationId);
    this.socket.emit('join_conversation', { conversation_id: conversationId });
  }

  /**
   * Leave a conversation room
   */
  leaveConversation(conversationId: string): void {
    if (!this.socket?.connected) return;

    console.log('Leaving conversation:', conversationId);
    this.socket.emit('leave_conversation', { conversation_id: conversationId });
  }

  /**
   * Listen for new messages
   */
  onNewMessage(callback: (message: WebSocketMessage) => void): void {
    if (!this.socket) return;
    this.socket.on('new_message', callback);
  }

  /**
   * Listen for message edits
   */
  onMessageEdited(callback: (message: WebSocketMessage) => void): void {
    if (!this.socket) return;
    this.socket.on('message_edited', callback);
  }

  /**
   * Listen for message deletions
   */
  onMessageDeleted(callback: (data: { message_id: string; conversation_id: string }) => void): void {
    if (!this.socket) return;
    this.socket.on('message_deleted', callback);
  }

  /**
   * Listen for message status updates (delivered/read)
   */
  onMessageStatus(callback: (data: { message_id: string; status: string; user_id: string; }) => void): void {
    if (!this.socket) return;
    this.socket.on('message_status', callback);
  }

  /**
   * Listen for typing indicators
   */
  onTyping(callback: (data: TypingIndicator) => void): void {
    if (!this.socket) return;
    this.socket.on('user_typing', callback);
  }

  /**
   * Listen for reactions
   */
  onReactionAdded(callback: (data: { message_id: string; user_id: string; emoji: string; }) => void): void {
    if (!this.socket) return;
    this.socket.on('reaction_added', callback);
  }

  onReactionRemoved(callback: (data: { message_id: string; user_id: string; emoji: string; }) => void): void {
    if (!this.socket) return;
    this.socket.on('reaction_removed', callback);
  }

  /**
   * Listen for user presence (online/offline)
   */
  onUserOnline(callback: (data: { user_id: string }) => void): void {
    if (!this.socket) return;
    this.socket.on('user_online', callback);
  }

  onUserOffline(callback: (data: { user_id: string }) => void): void {
    if (!this.socket) return;
    this.socket.on('user_offline', callback);
  }

  /**
   * Emit typing start event
   */
  emitTypingStart(conversationId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('typing_start', { conversation_id: conversationId });
  }

  /**
   * Emit typing stop event
   */
  emitTypingStop(conversationId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('typing_stop', { conversation_id: conversationId });
  }

  /**
   * Listen for messages being marked as read (by any user)
   */
  onMessageRead(callback: (data: { message_id: string; conversation_id: string; user_id: string; }) => void): void {
    if (!this.socket) return;
    this.socket.on('message_read', callback);
  }

  /**
   * Send message read receipt
   */
  emitMessageRead(messageId: string, conversationId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('message_read', {
      message_id: messageId,
      conversation_id: conversationId,
    });
  }

  /**
   * Listen for new poll creation
   */
  onNewPoll(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on('new_poll', callback);
  }

  /**
   * Listen for poll vote updates
   */
  onPollVote(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on('poll_vote_added', callback);
  }

  /**
   * Listen for poll closed events
   */
  onPollClosed(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on('poll_closed', callback);
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('Disconnecting WebSocket');
      this.socket.disconnect();
      this.socket = null;
      this.isConnecting = false;
    }
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Get the underlying socket instance (for advanced usage like .off())
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Remove specific event listener
   */
  off(event: string, callback?: (...args: unknown[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

// Export singleton instance
export const wsService = new WebSocketService();

// Export class for testing
export default WebSocketService;
