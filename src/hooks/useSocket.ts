/**
 * useSocket Hook
 * Manages Socket.IO connection with authentication
 */

import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // TEMPORARILY DISABLED - WebSocket connection failing on Railway
    // Will re-enable once backend WebSocket route is fixed
    console.warn('[Socket] WebSocket temporarily disabled - using HTTP polling fallback');
    setIsConnected(false);

    // TODO: Re-enable WebSocket
    // const token = localStorage.getItem('auth_token');
    // if (token) {
    //   const socket = socketClient.connect(token);
    //   ...
    // }
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
