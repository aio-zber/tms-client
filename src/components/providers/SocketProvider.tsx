/**
 * Socket Provider
 * Provides WebSocket connection context to the entire app.
 *
 * Messenger/Telegram pattern:
 * - Socket connects as soon as user is authenticated
 * - Connection state is shared across all components
 * - Automatic reconnection with event listener re-attachment
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { socketClient } from '@/lib/socket';
import { log } from '@/lib/logger';

interface SocketContextValue {
  isConnected: boolean;
  isConnecting: boolean;
  isReady: boolean; // True when socket is connected and ready to use
  connectionError: string | null;
  reconnectAttempts: number;
  connect: () => void;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
  children: React.ReactNode;
}

/**
 * Socket Provider Component
 * Initializes and manages WebSocket connection at the app level.
 *
 * This ensures:
 * 1. Socket connects immediately when user is authenticated
 * 2. All child components have access to connection state
 * 3. Reconnection is handled centrally
 */
export function SocketProvider({ children }: SocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Track if we've already initialized to prevent double-init
  const initializedRef = useRef(false);
  // Track connection readiness with a small delay to ensure stability
  const readyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      log.ws.warn('[SocketProvider] No auth token found - skipping connection');
      setIsConnecting(false);
      return;
    }

    // Prevent duplicate connections
    if (socketClient.isConnected()) {
      log.ws.debug('[SocketProvider] Already connected');
      setIsConnected(true);
      setIsReady(true);
      setIsConnecting(false);
      return;
    }

    log.ws.info('[SocketProvider] Initializing WebSocket connection...');
    setIsConnecting(true);
    setConnectionError(null);

    const socket = socketClient.connect(token);

    // Connection successful — socket is connected but NOT ready yet.
    // Ready state is set when server confirms rooms are joined (rooms_joined event).
    // This prevents the race condition where components try to use the socket
    // before the server has finished joining conversation rooms.
    const handleConnect = () => {
      log.ws.info('[SocketProvider] WebSocket connected, waiting for server room join...');
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionError(null);
      setReconnectAttempts(0);

      // Safety fallback: if rooms_joined doesn't arrive within 3s, mark ready anyway.
      // This prevents the app from hanging if the server fails to emit rooms_joined.
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
      }
      readyTimeoutRef.current = setTimeout(() => {
        setIsReady((prev) => {
          if (!prev) {
            log.ws.warn('[SocketProvider] Fallback: rooms_joined not received in 3s, marking ready');
          }
          return true;
        });
      }, 3000);
    };

    // Server confirms all conversation rooms are joined (Telegram pattern).
    // Only NOW is the socket ready for use — listeners can safely attach.
    const handleRoomsJoined = () => {
      log.ws.info('[SocketProvider] Server confirmed rooms joined — socket is ready');
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      setIsReady(true);
    };

    // Connection lost
    const handleDisconnect = (reason: string) => {
      log.ws.warn('[SocketProvider] WebSocket disconnected:', reason);
      setIsConnected(false);
      setIsReady(false);

      // Clear ready timeout if disconnected before ready
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }

      // Don't set connecting if it was an intentional disconnect
      if (reason !== 'io client disconnect') {
        setIsConnecting(true);
      }
    };

    // Connection error
    const handleError = (error: Error) => {
      log.ws.error('[SocketProvider] Connection error:', error.message);
      setConnectionError(error.message);
      setIsConnecting(false);
    };

    // Reconnection attempt
    const handleReconnectAttempt = (attempt: number) => {
      log.ws.info('[SocketProvider] Reconnection attempt:', attempt);
      setReconnectAttempts(attempt);
      setIsConnecting(true);
    };

    // Reconnection failed
    const handleReconnectFailed = () => {
      log.ws.error('[SocketProvider] All reconnection attempts failed');
      setIsConnecting(false);
      setConnectionError('Failed to reconnect after multiple attempts');
    };

    // Attach listeners
    socket.on('connect', handleConnect);
    socket.on('rooms_joined', handleRoomsJoined);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect_failed', handleReconnectFailed);

    // If already connected (socket reuse), trigger connect handler
    // which sets up the 3s fallback timeout for rooms_joined
    if (socket.connected) {
      handleConnect();
    }

    // Cleanup function for when provider unmounts
    return () => {
      socket.off('connect', handleConnect);
      socket.off('rooms_joined', handleRoomsJoined);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect_failed', handleReconnectFailed);

      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    log.ws.info('[SocketProvider] Disconnecting socket...');
    socketClient.disconnect();
    setIsConnected(false);
    setIsReady(false);
    setIsConnecting(false);
    initializedRef.current = false;
  }, []);

  // Initialize connection when provider mounts (only once)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const cleanup = connect();

    return () => {
      if (cleanup) cleanup();
    };
  }, [connect]);

  // Listen for auth token changes (login/logout)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        if (e.newValue) {
          // New token - reconnect
          log.ws.info('[SocketProvider] Auth token changed - reconnecting');
          disconnect();
          setTimeout(connect, 100); // Small delay to ensure clean state
        } else {
          // Token removed - disconnect
          log.ws.info('[SocketProvider] Auth token removed - disconnecting');
          disconnect();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [connect, disconnect]);

  const value: SocketContextValue = {
    isConnected,
    isConnecting,
    isReady,
    connectionError,
    reconnectAttempts,
    connect,
    disconnect,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Hook to access socket connection state
 * Must be used within SocketProvider
 */
export function useSocketConnection(): SocketContextValue {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error('useSocketConnection must be used within a SocketProvider');
  }

  return context;
}

/**
 * Hook to wait for socket to be ready
 * Returns true only when socket is connected and ready
 */
export function useSocketReady(): boolean {
  const context = useContext(SocketContext);
  return context?.isReady ?? false;
}
