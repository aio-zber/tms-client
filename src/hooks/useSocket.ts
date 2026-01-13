/**
 * useSocket Hook
 * Manages Socket.IO connection with authentication
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
      log.warn('[Socket] No auth token found - cannot connect');
      setIsConnecting(false);
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
      setIsConnecting(false);
    });

    socket.on('disconnect', () => {
      log.debug('[Socket] WebSocket disconnected');
      setIsConnected(false);
      setIsConnecting(false);
    });

    socket.on('connect_error', (error) => {
      log.error('[Socket] Connection error:', error.message);
      setIsConnected(false);
      setIsConnecting(false);
    });

    // Handle reconnection attempts
    socket.io.on('reconnect_attempt', () => {
      log.debug('[Socket] Attempting to reconnect...');
      setIsConnecting(true);
    });

    socket.io.on('reconnect', () => {
      log.debug('[Socket] Reconnected successfully');
      setIsConnected(true);
      setIsConnecting(false);
    });

    socket.io.on('reconnect_failed', () => {
      log.error('[Socket] Reconnection failed');
      setIsConnecting(false);
    });

    // Keep connection alive - don't disconnect on unmount
    // Socket should stay connected for the entire session
    return () => {
      log.debug('[Socket] Component unmounting but keeping connection alive');
      // Clean up reconnection listeners
      socket.io.off('reconnect_attempt');
      socket.io.off('reconnect');
      socket.io.off('reconnect_failed');
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
