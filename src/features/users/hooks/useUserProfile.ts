import { useState, useEffect } from 'react';
import { useUserStore } from '@/store/userStore';
import type { User } from '@/types/user';

/**
 * Hook to fetch and cache user profile data by user ID
 *
 * Features:
 * - Checks store cache first before making API call
 * - Handles loading and error states
 * - Provides refetch capability
 *
 * @param userId - The user ID to fetch
 * @returns { user, loading, error, refetch }
 */
export function useUserProfile(userId: string | undefined) {
  const { users, fetchUserById } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get user from cache
  const cachedUser = userId ? users[userId] : undefined;

  useEffect(() => {
    if (!userId) {
      setError('No user ID provided');
      return;
    }

    // If user is already in cache, don't fetch again
    if (cachedUser) {
      setLoading(false);
      setError(null);
      return;
    }

    // Fetch user data
    const fetchUser = async () => {
      setLoading(true);
      setError(null);

      try {
        await fetchUserById(userId);
        setLoading(false);
      } catch (err) {
        console.error('[useUserProfile] Failed to fetch user:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch user profile');
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, cachedUser, fetchUserById]);

  const refetch = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      await fetchUserById(userId);
      setLoading(false);
    } catch (err) {
      console.error('[useUserProfile] Failed to refetch user:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch user profile');
      setLoading(false);
    }
  };

  return {
    user: cachedUser as User | undefined,
    loading,
    error,
    refetch,
  };
}
