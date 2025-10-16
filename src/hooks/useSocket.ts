/**
 * useSocket Hook
 * Manages Socket.IO connection with authentication
 */

import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      console.warn('[Socket] No auth token found - cannot connect');
      return;
    }

    console.log('[Socket] Initializing WebSocket connection...');
    console.log('[Socket] Token preview (first 30 chars):', token.substring(0, 30) + '...');
    console.log('[Socket] Token length:', token.length);

    const socket = socketClient.connect(token);

    // Update connection status
    socket.on('connect', () => {
      console.log('[Socket] WebSocket connected successfully');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setIsConnected(false);
    });

    // Keep connection alive - don't disconnect on unmount
    // Socket should stay connected for the entire session
    return () => {
      console.log('[Socket] Component unmounting but keeping connection alive');
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
