/**
 * User Service
 * Handles all user-related API calls to the TMS backend.
 */

import { apiClient, ApiError } from '@/lib/apiClient';
import {
  User,
  UserSearchResult,
  UserProfile,
  UserSearchParams,
} from '@/types/user';

/**
 * User Service Class
 * Provides methods to interact with user-related endpoints.
 */
class UserService {
  /**
   * Get current authenticated user.
   * Fetches full user profile from /api/v1/users/me.
   *
   * @returns Promise<User> Current user data
   * @throws ApiError if authentication fails
   *
   * @example
   * const currentUser = await userService.getCurrentUser();
   * console.log(currentUser.displayName);
   */
  async getCurrentUser(): Promise<User> {
    try {
      const user = await apiClient.get<User>('/users/me');

      // Cache user in localStorage for quick access
      if (typeof window !== 'undefined') {
        localStorage.setItem('user_data', JSON.stringify(user));
      }

      return user;
    } catch (error) {
      console.error('Failed to fetch current user:', error);

      // If offline or API error, try to return cached data
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('user_data');
        if (cached) {
          return JSON.parse(cached);
        }
      }

      throw error;
    }
  }

  /**
   * Get user by ID (local UUID or TMS user ID).
   *
   * @param userId User ID (local or TMS)
   * @returns Promise<UserProfile> User profile data
   * @throws ApiError if user not found
   *
   * @example
   * const user = await userService.getUserById('user-123');
   */
  async getUserById(userId: string): Promise<UserProfile> {
    return apiClient.get<UserProfile>(`/users/${userId}`);
  }

  /**
   * Search users by query with optional filters.
   *
   * @param params Search parameters (query, filters, limit)
   * @returns Promise<UserSearchResult[]> List of matching users
   *
   * @example
   * const users = await userService.searchUsers({
   *   query: 'john',
   *   filters: { division: 'Engineering', isActive: true },
   *   limit: 10
   * });
   */
  async searchUsers(params: UserSearchParams): Promise<UserSearchResult[]> {
    const { query, filters, limit = 20 } = params;

    // Build query parameters
    const queryParams: Record<string, string | number | boolean> = {
      q: query,
      limit,
    };

    // Add filters to query params
    if (filters) {
      if (filters.division) queryParams.division = filters.division;
      if (filters.department) queryParams.department = filters.department;
      if (filters.section) queryParams.section = filters.section;
      if (filters.role) queryParams.role = filters.role;
      if (filters.isActive !== undefined) queryParams.is_active = filters.isActive;
    }

    return apiClient.get<UserSearchResult[]>('/users', queryParams);
  }

  /**
   * Sync specific users from TMS (admin only).
   *
   * @param userIds Optional array of TMS user IDs to sync
   * @param force Force sync even if recently synced
   * @returns Promise with sync results
   * @throws ApiError if not admin or sync fails
   *
   * @example
   * const result = await userService.syncUsers(['tms-123', 'tms-456'], true);
   * console.log(`Synced ${result.synced_count} users`);
   */
  async syncUsers(userIds?: string[], force: boolean = false): Promise<{
    success: boolean;
    synced_count: number;
    failed_count: number;
    errors: string[];
  }> {
    return apiClient.post('/users/sync', {
      tms_user_ids: userIds,
      force,
    });
  }

  /**
   * Invalidate user cache (admin only).
   *
   * @param tmsUserId TMS user ID
   * @returns Promise<void>
   * @throws ApiError if not admin
   *
   * @example
   * await userService.invalidateUserCache('tms-123');
   */
  async invalidateUserCache(tmsUserId: string): Promise<void> {
    await apiClient.delete(`/users/cache/${tmsUserId}`);
  }

  /**
   * Get cached current user from localStorage.
   * Use this for quick access without API call.
   *
   * @returns User | null Cached user or null if not found
   *
   * @example
   * const cachedUser = userService.getCachedCurrentUser();
   * if (cachedUser) {
   *   console.log('Welcome back,', cachedUser.displayName);
   * }
   */
  getCachedCurrentUser(): User | null {
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem('user_data');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Failed to parse cached user data:', error);
    }

    return null;
  }

  /**
   * Clear cached user data.
   * Call this on logout.
   *
   * @example
   * userService.clearCache();
   */
  clearCache(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('user_data');
  }
}

// Export singleton instance
export const userService = new UserService();

// Export class for testing
export default UserService;
