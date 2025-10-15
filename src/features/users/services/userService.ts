/**
 * User Service
 * Handles all user-related API calls.
 * All user data comes from GCGC Team Management System.
 */

import { tmsApi } from '@/lib/tmsApi';
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
   * Fetches full user profile from GCGC Team Management System.
   *
   * @returns Promise<User> Current user data
   * @throws Error if authentication fails
   *
   * @example
   * const currentUser = await userService.getCurrentUser();
   * console.log(currentUser.displayName);
   */
  async getCurrentUser(): Promise<User> {
    try {
      const tmsUser = await tmsApi.getCurrentUser();
      const user = tmsApi.transformTMSUser(tmsUser);

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
  async getUserById(_userId: string): Promise<UserProfile> {
    // Note: This should be handled by TMS-client backend, not directly from GCGC TMS
    // For now, throwing an error as this needs backend implementation
    throw new Error('getUserById not implemented - requires TMS-client backend');
  }

  /**
   * Search users by query with optional filters.
   * Searches directly from GCGC Team Management System API.
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
    const { query, limit = 20 } = params;

    try {
      // Search users directly from Team Management System
      const tmsUsers = await tmsApi.searchUsers(query, limit);

      // Transform TMS users to UserSearchResult format
      // Note: TMS users don't have local UUIDs yet - they'll be created when a conversation starts
      return tmsUsers.map((tmsUser) => ({
        id: tmsUser.id, // TMS user ID (will be synced to backend when conversation is created)
        tmsUserId: tmsUser.id,
        email: tmsUser.email,
        username: tmsUser.username,
        name: tmsUser.displayName || tmsUser.name || `${tmsUser.firstName || ''} ${tmsUser.lastName || ''}`.trim() || tmsUser.email,
        firstName: tmsUser.firstName,
        lastName: tmsUser.lastName,
        image: tmsUser.image,
        positionTitle: tmsUser.positionTitle,
        division: tmsUser.division,
        department: tmsUser.department,
        section: tmsUser.section,
        customTeam: tmsUser.customTeam,
        isActive: tmsUser.isActive,
      }));
    } catch (error) {
      console.error('Failed to search users from Team Management System:', error);
      throw error;
    }
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
  async syncUsers(_userIds?: string[], _force: boolean = false): Promise<{
    success: boolean;
    synced_count: number;
    failed_count: number;
    errors: string[];
  }> {
    // Note: This should be handled by TMS-client backend, not directly from GCGC TMS
    // For now, throwing an error as this needs backend implementation
    throw new Error('syncUsers not implemented - requires TMS-client backend');
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
  async invalidateUserCache(_tmsUserId: string): Promise<void> {
    // Note: This should be handled by TMS-client backend, not directly from GCGC TMS
    // For now, throwing an error as this needs backend implementation
    throw new Error('invalidateUserCache not implemented - requires TMS-client backend');
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
