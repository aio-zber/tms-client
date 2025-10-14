/**
 * useCurrentUser Hook
 * Hook for accessing and managing the current authenticated user.
 */

import { useEffect } from 'react';
import { useUserStore, selectCurrentUser, selectIsAuthenticated, selectIsLoading, selectError } from '@/store/userStore';

/**
 * Hook to get current authenticated user.
 * Automatically fetches user on mount if not already loaded.
 *
 * @param autoFetch Whether to automatically fetch user on mount (default: true)
 * @returns Current user state and actions
 *
 * @example
 * ```tsx
 * function Profile() {
 *   const { user, isLoading, error, refetch } = useCurrentUser();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   if (!user) return <div>Not authenticated</div>;
 *
 *   return <div>Welcome, {user.displayName}</div>;
 * }
 * ```
 */
export function useCurrentUser(autoFetch: boolean = true) {
  const user = useUserStore(selectCurrentUser);
  const isAuthenticated = useUserStore(selectIsAuthenticated);
  const isLoading = useUserStore(selectIsLoading);
  const error = useUserStore(selectError);
  const fetchCurrentUser = useUserStore((state) => state.fetchCurrentUser);
  const updateCurrentUser = useUserStore((state) => state.updateCurrentUser);
  const logout = useUserStore((state) => state.logout);

  useEffect(() => {
    // Auto-fetch user if not loaded and autoFetch is enabled
    if (autoFetch && !user && !isLoading && !error) {
      fetchCurrentUser();
    }
  }, [autoFetch, user, isLoading, error, fetchCurrentUser]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    refetch: fetchCurrentUser,
    updateUser: updateCurrentUser,
    logout,
  };
}
