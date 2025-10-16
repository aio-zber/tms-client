/**
 * Socket.IO Client Setup
 * Manages WebSocket connection for real-time messaging
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:8000';

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Initialize Socket.IO connection
   */
  connect(token: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    console.log('[SocketClient] Connecting to:', SOCKET_URL);
    console.log('[SocketClient] Path:', '/socket.io');
    console.log('[SocketClient] Full URL:', `${SOCKET_URL}/socket.io/`);

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

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[Socket] Max reconnection attempts reached');
        this.socket?.disconnect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('[Socket] Error:', error);
    });
  }

  /**
   * Join a conversation room
   */
  joinConversation(conversationId: string) {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot join conversation - not connected');
      return;
    }

    this.socket.emit('join_conversation', { conversation_id: conversationId });

    this.socket.once('joined_conversation', (data) => {
      console.log('[Socket] Joined conversation:', data.conversation_id);
    });
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
    this.socket?.on('new_message', callback);
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
    this.socket?.on('message_deleted', callback);
  }

  /**
   * Listen for message status updates
   */
  onMessageStatus(callback: (data: Record<string, unknown>) => void) {
    this.socket?.on('message_status', callback);
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
