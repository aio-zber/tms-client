/**
 * useSocket Hook
 * Manages Socket.IO connection with authentication
 */

import { useEffect, useState } from 'react';
import { socketClient } from '@/lib/socket';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Get auth token from localStorage (same as apiClient)
    const token = localStorage.getItem('auth_token');

    if (token) {
      const socket = socketClient.connect(token);

      const handleConnect = () => {
        setIsConnected(true);
      };

      const handleDisconnect = () => {
        setIsConnected(false);
      };

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      // Set initial connection status
      setIsConnected(socket.connected);

      // Cleanup on unmount
      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      };
    } else {
      // No token - disconnect
      socketClient.disconnect();
      setIsConnected(false);
    }
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
