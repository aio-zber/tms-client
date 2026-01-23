/**
 * useSocket Hook
 * Provides access to Socket.IO connection state and methods.
 *
 * This hook works with the SocketProvider to ensure the socket
 * is properly initialized before use. It tracks connection state
 * and provides methods for joining/leaving conversations and typing indicators.
 *
 * Messenger/Telegram pattern:
 * - Socket connects early via SocketProvider
 * - This hook provides access to connection state
 * - Components can use this to know when socket is ready
 */

import { log } from '@/lib/logger';
import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      log.warn('[useSocket] No auth token found - cannot connect');
      setIsConnecting(false);
      return;
    }

    // Check if already connected (via SocketProvider)
    if (socketClient.isConnected()) {
      log.debug('[useSocket] Socket already connected via SocketProvider');
      setIsConnected(true);
      setIsConnecting(false);
    } else {
      // Initialize connection if not already done by SocketProvider
      log.debug('[useSocket] Initializing WebSocket connection...');
      socketClient.connect(token);
    }

    const socket = socketClient.getSocket();
    if (!socket) {
      log.warn('[useSocket] Socket not initialized');
      setIsConnecting(false);
      return;
    }

    // Update connection status
    const handleConnect = () => {
      log.debug('[useSocket] WebSocket connected successfully');
      setIsConnected(true);
      setIsConnecting(false);
    };

    const handleDisconnect = () => {
      log.debug('[useSocket] WebSocket disconnected');
      setIsConnected(false);
      setIsConnecting(false);
    };

    const handleConnectError = (error: Error) => {
      log.error('[useSocket] Connection error:', error.message);
      setIsConnected(false);
      setIsConnecting(false);
    };

    const handleReconnectAttempt = () => {
      log.debug('[useSocket] Attempting to reconnect...');
      setIsConnecting(true);
    };

    const handleReconnect = () => {
      log.debug('[useSocket] Reconnected successfully');
      setIsConnected(true);
      setIsConnecting(false);
    };

    const handleReconnectFailed = () => {
      log.error('[useSocket] Reconnection failed');
      setIsConnecting(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect', handleReconnect);
    socket.io.on('reconnect_failed', handleReconnectFailed);

    // Check current state immediately
    if (socket.connected) {
      handleConnect();
    }

    // Keep connection alive - don't disconnect on unmount
    // Socket should stay connected for the entire session
    return () => {
      log.debug('[useSocket] Component unmounting but keeping connection alive');
      // Clean up listeners
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect', handleReconnect);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      // Don't call socketClient.disconnect() here
      // Connection will be cleaned up when user logs out or closes tab
    };
  }, []); // Connect once on mount

  return {
    socket: socketClient.getSocket(),
    isConnected,
    isConnecting,
    joinConversation: socketClient.joinConversation.bind(socketClient),
    leaveConversation: socketClient.leaveConversation.bind(socketClient),
    startTyping: socketClient.startTyping.bind(socketClient),
    stopTyping: socketClient.stopTyping.bind(socketClient),
  };
}
