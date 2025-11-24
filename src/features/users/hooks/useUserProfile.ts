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
 * - Can skip fetching if data is already provided
 *
 * @param userId - The user ID to fetch
 * @param options - Optional configuration { skip: boolean }
 * @returns { user, loading, error, refetch }
 */
export function useUserProfile(userId: string | undefined, options?: { skip?: boolean }) {
  const { users, fetchUserById } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skip = options?.skip ?? false;

  // Get user from cache
  const cachedUser = userId ? users[userId] : undefined;

  useEffect(() => {
    // Skip fetching if explicitly told to skip (e.g., userData already provided)
    if (skip) {
      setLoading(false);
      setError(null);
      return;
    }

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
  }, [userId, cachedUser, fetchUserById, skip]);

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
