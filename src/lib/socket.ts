/**
 * Socket.IO Client Setup
 * Manages WebSocket connection for real-time messaging
 */

import { io, Socket } from 'socket.io-client';
import { log } from './logger';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:8000';

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Initialize Socket.IO connection
   */
  connect(token: string): Socket {
    // If socket already exists (even if disconnected), reuse it
    if (this.socket) {
      return this.socket;
    }

    // CRITICAL PATH CONFIGURATION:
    // Server wraps FastAPI with Socket.IO ASGIApp (socketio.ASGIApp(sio, fastapi_app))
    // Socket.IO handles /socket.io/* endpoints directly
    // Client connects to: /socket.io/?EIO=4&transport=websocket
    this.socket = io(SOCKET_URL, {
      path: '/socket.io',  // CORRECT: Default Socket.IO path matches server
      auth: {
        token,
      },
      // WebSocket-only transport for Railway (polling unreliable)
      transports: ['websocket'],
      upgrade: false,  // Don't upgrade from polling
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      timeout: 20000,  // Increased timeout for Railway
      autoConnect: true,
      forceNew: false,
    });

    this.setupEventHandlers();

    return this.socket;
  }

  /**
   * Setup global event handlers
   */
  private setupEventHandlers() {
    if (!this.socket) return;

    // Essential log #1: Connection established
    this.socket.on('connect', () => {
      log.ws.info('Connected to server');
      this.reconnectAttempts = 0;
    });

    // Essential log #2: Disconnected (with reason)
    this.socket.on('disconnect', (reason) => {
      log.ws.warn('Disconnected:', reason);
    });

    // Essential log #3 & #4: Connection error & max reconnection attempts
    this.socket.on('connect_error', (error) => {
      log.ws.error('Connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        log.ws.error('Max reconnection attempts reached');
        this.socket?.disconnect();
      }
    });

    // Essential log #5: General errors
    this.socket.on('error', (error) => {
      log.ws.error('Error:', error);
    });
  }

  /**
   * Join a conversation room
   */
  joinConversation(conversationId: string) {
    if (!this.socket) {
      log.ws.warn('Cannot join conversation - socket not initialized');
      return;
    }

    // Emit join event - Socket.IO will queue if not connected yet
    this.socket.emit('join_conversation', { conversation_id: conversationId });
  }

  /**
   * Leave a conversation room
   */
  leaveConversation(conversationId: string) {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('leave_conversation', { conversation_id: conversationId });
  }

  /**
   * Emit typing started event
   */
  startTyping(conversationId: string) {
    if (!this.socket?.connected) return;
    this.socket.emit('typing_start', { conversation_id: conversationId });
  }

  /**
   * Emit typing stopped event
   */
  stopTyping(conversationId: string) {
    if (!this.socket?.connected) return;
    this.socket.emit('typing_stop', { conversation_id: conversationId });
  }

  /**
   * Listen for new messages
   */
  onNewMessage(callback: (message: Record<string, unknown>) => void) {
    if (this.socket) {
      // Don't wrap - use callback directly so off() works
      this.socket.on('new_message', callback);
    } else {
      log.ws.error('Cannot attach new_message listener - socket not initialized');
    }
  }

  /**
   * Listen for message edits
   */
  onMessageEdited(callback: (message: Record<string, unknown>) => void) {
    this.socket?.on('message_edited', callback);
  }

  /**
   * Listen for message deletions
   */
  onMessageDeleted(callback: (data: Record<string, unknown>) => void) {
    if (this.socket) {
      this.socket.on('message_deleted', callback);
    } else {
      log.ws.error('Cannot attach message_deleted listener - socket not initialized');
    }
  }

  /**
   * Listen for message status updates
   */
  onMessageStatus(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('message_status', callback);
  }

  /**
   * Listen for messages being marked as read
   */
  onMessageRead(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('message_read', callback);
  }

  /**
   * Listen for typing indicators
   */
  onUserTyping(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('user_typing', callback);
  }

  /**
   * Listen for user online status
   */
  onUserOnline(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('user_online', callback);
  }

  /**
   * Listen for user offline status
   */
  onUserOffline(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('user_offline', callback);
  }

  /**
   * Listen for reactions
   */
  onReactionAdded(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('reaction_added', callback);
  }

  onReactionRemoved(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('reaction_removed', callback);
  }

  /**
   * Listen for new poll creation
   */
  onNewPoll(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('new_poll', callback);
  }

  /**
   * Listen for poll vote updates
   */
  onPollVote(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('poll_vote_added', callback);
  }

  /**
   * Listen for poll closed events
   */
  onPollClosed(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('poll_closed', callback);
  }

  /**
   * Listen for member added events
   */
  onMemberAdded(callback: (data: Record<string, unknown>) => void) {
    if (this.socket) {
      this.socket.on('member_added', callback);
    } else {
      log.ws.error('Cannot attach member_added listener - socket not initialized');
    }
  }

  /**
   * Listen for member removed events
   */
  onMemberRemoved(callback: (data: Record<string, unknown>) => void) {
    if (this.socket) {
      this.socket.on('member_removed', callback);
    } else {
      log.ws.error('Cannot attach member_removed listener - socket not initialized');
    }
  }

  /**
   * Listen for member left events
   */
  onMemberLeft(callback: (data: Record<string, unknown>) => void) {
    if (this.socket) {
      this.socket.on('member_left', callback);
    } else {
      log.ws.error('Cannot attach member_left listener - socket not initialized');
    }
  }

  /**
   * Listen for conversation updated events
   */
  onConversationUpdated(callback: (data: Record<string, unknown>) => void) {
    if (this.socket) {
      this.socket.on('conversation_updated', callback);
    } else {
      log.ws.error('Cannot attach conversation_updated listener - socket not initialized');
    }
  }

  /**
   * Remove event listener
   */
  off(event: string, callback?: (data: Record<string, unknown>) => void) {
    this.socket?.off(event, callback);
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Get socket instance
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Export singleton instance
export const socketClient = new SocketClient();
