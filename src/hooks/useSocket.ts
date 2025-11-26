/**
 * useSocket Hook
 * Manages Socket.IO connection with authentication
 */

import { log } from '@/lib/logger';
import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      log.warn('[Socket] No auth token found - cannot connect');
      return;
    }

    log.debug('[Socket] Initializing WebSocket connection...');
    log.debug('[Socket] Token preview (first 30 chars):', token.substring(0, 30) + '...');
    log.debug('[Socket] Token length:', token.length);

    const socket = socketClient.connect(token);

    // Update connection status
    socket.on('connect', () => {
      log.debug('[Socket] WebSocket connected successfully');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      log.debug('[Socket] WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      log.error('[Socket] Connection error:', error.message);
      setIsConnected(false);
    });

    // Keep connection alive - don't disconnect on unmount
    // Socket should stay connected for the entire session
    return () => {
      log.debug('[Socket] Component unmounting but keeping connection alive');
      // Don't call socketClient.disconnect() here
      // Connection will be cleaned up when user logs out or closes tab
    };
  }, []); // Connect once on mount

  return {
    socket: socketClient.getSocket(),
    isConnected,
    joinConversation: socketClient.joinConversation.bind(socketClient),
    leaveConversation: socketClient.leaveConversation.bind(socketClient),
    startTyping: socketClient.startTyping.bind(socketClient),
    stopTyping: socketClient.stopTyping.bind(socketClient),
  };
}
