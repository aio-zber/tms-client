/**
 * Connection Status Indicator
 * Shows WebSocket connection status (similar to Messenger/Telegram)
 * - Connected: Green dot
 * - Connecting: Yellow dot (pulsing)
 * - Disconnected: Red dot
 */

'use client';

import { useSocket } from '@/hooks/useSocket';
import { Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ConnectionStatus() {
  const { isConnected, isConnecting } = useSocket();
  const [showDisconnected, setShowDisconnected] = useState(false);

  // Only show disconnected state if disconnected for more than 2 seconds
  // This prevents flickering during quick reconnections
  useEffect(() => {
    if (!isConnected && !isConnecting) {
      const timer = setTimeout(() => {
        setShowDisconnected(true);
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      setShowDisconnected(false);
    }
  }, [isConnected, isConnecting]);

  // Don't show anything if connected (normal state)
  if (isConnected) {
    return null;
  }

  // Show connecting state
  if (isConnecting) {
    return (
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-lg shadow-lg">
        <div className="relative">
          <Wifi className="w-4 h-4" />
          <div className="absolute inset-0 bg-yellow-400 rounded-full animate-ping opacity-25" />
        </div>
        <span className="text-sm font-medium">Connecting...</span>
      </div>
    );
  }

  // Show disconnected state (only after 2 seconds)
  if (showDisconnected) {
    return (
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg shadow-lg">
        <WifiOff className="w-4 h-4" />
        <span className="text-sm font-medium">Connection lost. Reconnecting...</span>
      </div>
    );
  }

  return null;
}
