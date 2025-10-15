/**
 * useSocket Hook
 * Manages Socket.IO connection with authentication
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { socketClient } from '@/lib/socket';

export function useSocket() {
  const { data: session, status } = useSession();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Only connect if user is authenticated
    if (status === 'authenticated' && session?.accessToken) {
      const socket = socketClient.connect(session.accessToken as string);

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
    } else if (status === 'unauthenticated') {
      // Disconnect if user logs out
      socketClient.disconnect();
      setIsConnected(false);
    }
  }, [status, session?.accessToken]);

  return {
    socket: socketClient.getSocket(),
    isConnected,
    joinConversation: socketClient.joinConversation.bind(socketClient),
    leaveConversation: socketClient.leaveConversation.bind(socketClient),
    startTyping: socketClient.startTyping.bind(socketClient),
    stopTyping: socketClient.stopTyping.bind(socketClient),
  };
}
