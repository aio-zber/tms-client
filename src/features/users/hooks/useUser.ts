/**
 * useUser Hook
 * Hook for fetching and caching individual users by ID.
 */

import { log } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { useUserStore } from '@/store/userStore';
import { User } from '@/types/user';

/**
 * Hook to fetch and cache a specific user by ID.
 * First checks cache, then fetches from API if needed.
 *
 * @param userId User ID (local or TMS)
 * @param autoFetch Whether to automatically fetch if not in cache (default: true)
 * @returns User data, loading state, and error
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: string }) {
 *   const { user, isLoading, error } = useUser(userId);
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   if (!user) return <div>User not found</div>;
 *
 *   return (
 *     <div>
 *       <h2>{user.displayName}</h2>
 *       <p>{user.email}</p>
 *       <p>{user.positionTitle}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUser(userId: string | null | undefined, autoFetch: boolean = true) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCachedUser = useUserStore((state) => state.getCachedUser);
  const fetchUserById = useUserStore((state) => state.fetchUserById);

  // Get cached user
  const cachedUser = userId ? getCachedUser(userId) : null;
  const [user, setUser] = useState<User | null>(cachedUser);

  useEffect(() => {
    if (!userId) {
      setUser(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Check cache first
    const cached = getCachedUser(userId);
    if (cached) {
      setUser(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Fetch from API if autoFetch enabled and not cached
    if (autoFetch) {
      setIsLoading(true);
      setError(null);

      fetchUserById(userId)
        .then((fetchedUser) => {
          setUser(fetchedUser);
          setIsLoading(false);
        })
        .catch((err) => {
          log.error(`Failed to fetch user ${userId}:`, err);
          setError(err.message || 'Failed to fetch user');
          setIsLoading(false);
        });
    }
  }, [userId, autoFetch, getCachedUser, fetchUserById]);

  return {
    user,
    isLoading,
    error,
  };
}
