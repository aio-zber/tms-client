/**
 * usePresence Hook
 * Tracks online/offline status of users via WebSocket events.
 *
 * Messenger-style implementation:
 * - User is online when they have an active WebSocket connection
 * - User goes offline when all their connections are closed
 * - Initial load fetches current online users from API
 * - Real-time updates via user_online/user_offline socket events
 * - Properly waits for socket connection before attaching listeners
 */

import { useEffect, useCallback, useState } from 'react';
import { create } from 'zustand';
import { socketClient } from '@/lib/socket';
import { userService } from '@/features/users/services/userService';
import { log } from '@/lib/logger';

/**
 * Presence store - tracks online user IDs globally
 */
interface PresenceState {
  onlineUsers: Set<string>;
  isLoading: boolean;
  lastUpdated: number | null;
  setOnlineUsers: (userIds: string[]) => void;
  addOnlineUser: (userId: string) => void;
  removeOnlineUser: (userId: string) => void;
  isUserOnline: (userId: string) => boolean;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: new Set(),
  isLoading: true,
  lastUpdated: null,

  setOnlineUsers: (userIds: string[]) => {
    set({
      onlineUsers: new Set(userIds),
      isLoading: false,
      lastUpdated: Date.now(),
    });
  },

  addOnlineUser: (userId: string) => {
    const { onlineUsers } = get();
    if (!onlineUsers.has(userId)) {
      const newSet = new Set(onlineUsers);
      newSet.add(userId);
      set({ onlineUsers: newSet, lastUpdated: Date.now() });
      log.debug('[Presence] User online:', userId);
    }
  },

  removeOnlineUser: (userId: string) => {
    const { onlineUsers } = get();
    if (onlineUsers.has(userId)) {
      const newSet = new Set(onlineUsers);
      newSet.delete(userId);
      set({ onlineUsers: newSet, lastUpdated: Date.now() });
      log.debug('[Presence] User offline:', userId);
    }
  },

  isUserOnline: (userId: string) => {
    return get().onlineUsers.has(userId);
  },
}));

/**
 * Hook to initialize and manage presence tracking.
 * Call this once at the app level (e.g., in layout or main chat component).
 * Properly waits for socket connection before attaching listeners.
 */
export function usePresenceInit() {
  const { setOnlineUsers, addOnlineUser, removeOnlineUser } = usePresenceStore();
  const [isSocketReady, setIsSocketReady] = useState(false);

  // Monitor socket connection state
  useEffect(() => {
    // Check immediately
    if (socketClient.isConnected()) {
      setIsSocketReady(true);
      return;
    }

    // Wait for socket to be ready
    const checkInterval = setInterval(() => {
      const socket = socketClient.getSocket();
      if (socket?.connected) {
        setIsSocketReady(true);
        clearInterval(checkInterval);
      }
    }, 100);

    // Also listen for connect event once socket is available
    const socket = socketClient.getSocket();
    if (socket) {
      const handleConnect = () => setIsSocketReady(true);
      const handleDisconnect = () => setIsSocketReady(false);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      return () => {
        clearInterval(checkInterval);
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      };
    }

    return () => clearInterval(checkInterval);
  }, []);

  // Fetch initial online users
  const fetchOnlineUsers = useCallback(async () => {
    try {
      const onlineUserIds = await userService.getOnlineUsers();
      setOnlineUsers(onlineUserIds);
      log.debug('[Presence] Initial online users:', onlineUserIds.length);
    } catch (error) {
      log.error('[Presence] Failed to fetch online users:', error);
      setOnlineUsers([]); // Set empty to mark as loaded
    }
  }, [setOnlineUsers]);

  // Set up socket listeners once socket is ready
  useEffect(() => {
    // Fetch initial online users immediately (doesn't require socket)
    fetchOnlineUsers();

    // Wait for socket to be ready before attaching listeners
    if (!isSocketReady) {
      log.debug('[Presence] Waiting for socket to be ready...');
      return;
    }

    const socket = socketClient.getSocket();
    if (!socket) {
      log.warn('[Presence] Socket not available despite ready state');
      return;
    }

    log.info('[Presence] Socket ready, attaching presence listeners');

    // Set up WebSocket event listeners for real-time updates
    const handleUserOnline = (data: Record<string, unknown>) => {
      const userId = data.user_id as string;
      if (userId) {
        addOnlineUser(userId);
      }
    };

    const handleUserOffline = (data: Record<string, unknown>) => {
      const userId = data.user_id as string;
      if (userId) {
        removeOnlineUser(userId);
      }
    };

    // Handle reconnection - refresh online users to sync state
    const handleReconnect = () => {
      log.info('[Presence] Socket reconnected, refreshing online users');
      fetchOnlineUsers();
    };

    // Register listeners
    socketClient.onUserOnline(handleUserOnline);
    socketClient.onUserOffline(handleUserOffline);
    socket.on('connect', handleReconnect);

    return () => {
      // Clean up listeners
      socketClient.off('user_online', handleUserOnline);
      socketClient.off('user_offline', handleUserOffline);
      socket.off('connect', handleReconnect);
    };
  }, [fetchOnlineUsers, addOnlineUser, removeOnlineUser, isSocketReady]);
}

/**
 * Hook to check if a specific user is online.
 * Use this in components that need to display online status.
 *
 * @param userId - The user ID to check
 * @returns boolean - Whether the user is online
 *
 * @example
 * const isOnline = useIsUserOnline(userId);
 * return <OnlineIndicator isOnline={isOnline} />;
 */
export function useIsUserOnline(userId: string | undefined): boolean {
  const onlineUsers = usePresenceStore((state) => state.onlineUsers);

  if (!userId) return false;
  return onlineUsers.has(userId);
}

/**
 * Hook to get all online user IDs.
 *
 * @returns Set<string> - Set of online user IDs
 */
export function useOnlineUsers(): Set<string> {
  return usePresenceStore((state) => state.onlineUsers);
}

/**
 * Hook to get presence loading state.
 *
 * @returns boolean - Whether presence data is still loading
 */
export function usePresenceLoading(): boolean {
  return usePresenceStore((state) => state.isLoading);
}
