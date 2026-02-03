/**
 * User Service
 * Handles all user-related API calls.
 * All requests route through TMS Server (not GCGC directly).
 */

import { log } from '@/lib/logger';
import { tmsApi } from '@/lib/tmsApi';
import { getApiBaseUrl, STORAGE_KEYS } from '@/lib/constants';
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
   * log.debug(currentUser.displayName);
   */
  async getCurrentUser(): Promise<User> {
    try {
      // IMPORTANT: Fetch from tms-server backend (NOT GCGC directly)
      // This returns the local UUID that matches message.senderId
      const apiBaseUrl = getApiBaseUrl();
      const token = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) : null;

      const response = await fetch(`${apiBaseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch current user: ${response.statusText}`);
      }

      const userData = await response.json();

      // Validate response has required fields
      if (!userData.id || !userData.tmsUserId) {
        log.error('❌ Backend /users/me response missing required ID fields', {
          hasId: !!userData.id,
          hasTmsUserId: !!userData.tmsUserId
        });
        throw new Error('Invalid user data from backend - missing required ID fields');
      }

      // Transform backend response to User format
      // Backend now returns camelCase via Pydantic serialization_alias
      const user: User = {
        id: userData.id, // Local UUID from tms-server (matches message.senderId!)
        tmsUserId: userData.tmsUserId, // TMS CUID - no fallback, fail fast if missing
        email: userData.email,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        middleName: userData.middleName,
        name: userData.name,
        displayName: userData.displayName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
        image: userData.image,
        role: userData.role,
        positionTitle: userData.positionTitle,
        division: userData.division,
        department: userData.department,
        section: userData.section,
        customTeam: userData.customTeam,
        hierarchyLevel: userData.hierarchyLevel,
        reportsToId: userData.reportsToId,
        isActive: userData.isActive !== false,
        isLeader: userData.isLeader || userData.role === 'LEADER' || userData.role === 'ADMIN',
        createdAt: userData.createdAt || new Date().toISOString(),
        lastSyncedAt: userData.lastSyncedAt,
      };

      // Cache user in localStorage for quick access
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
      }

      return user;
    } catch (error) {
      log.error('Failed to fetch current user:', error);

      // If offline or API error, try to return cached data
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(STORAGE_KEYS.USER_DATA);
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
      // Backend returns both: id (local UUID) and tmsUserId (TMS ID)
      return tmsUsers.map((tmsUser) => ({
        id: tmsUser.id, // Local UUID from tms-server database
        tmsUserId: tmsUser.tmsUserId || tmsUser.id, // TMS user ID for reference
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
      log.error('Failed to search users from Team Management System:', error);
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
   * log.debug(`Synced ${result.synced_count} users`);
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
   *   log.debug('Welcome back,', cachedUser.displayName);
   * }
   */
  getCachedCurrentUser(): User | null {
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem(STORAGE_KEYS.USER_DATA);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      log.error('Failed to parse cached user data:', error);
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
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
  }

  /**
   * Get list of currently online user IDs.
   * Used for displaying online status indicators (green dots).
   *
   * @returns Promise<string[]> Array of online user IDs (local UUIDs)
   *
   * @example
   * const onlineUserIds = await userService.getOnlineUsers();
   * const isUserOnline = onlineUserIds.includes(userId);
   */
  async getOnlineUsers(): Promise<string[]> {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const token = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) : null;

      const response = await fetch(`${apiBaseUrl}/users/presence/online`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch online users: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      log.error('Failed to fetch online users:', error);
      return []; // Return empty array on error to prevent UI crashes
    }
  }
}

// Export singleton instance
export const userService = new UserService();

// Export class for testing
export default UserService;
