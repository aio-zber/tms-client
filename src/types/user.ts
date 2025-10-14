/**
 * User-related type definitions
 * Note: User data comes from TMS and is view-only
 */

export type UserStatus = 'online' | 'away' | 'offline';

// TMS role types (uppercase as returned by TMS API)
export type TMSRole = 'ADMIN' | 'LEADER' | 'MEMBER';

// Mapped role types for internal use
export type UserRole = 'admin' | 'leader' | 'member';

/**
 * Full user interface with all TMS fields.
 * This represents the complete user data from backend API.
 */
export interface User {
  // Local identifiers
  id: string; // Local database UUID
  tmsUserId: string; // TMS user ID (primary identifier)

  // Basic information
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  name?: string; // Full name from TMS
  displayName: string; // Computed display name
  image?: string; // Profile image URL

  // Role and position
  role: TMSRole; // ADMIN, LEADER, MEMBER
  positionTitle?: string;

  // Organizational hierarchy
  division?: string;
  department?: string;
  section?: string;
  customTeam?: string;
  hierarchyLevel?: string;
  reportsToId?: string;

  // Status flags
  isActive: boolean;
  isLeader: boolean;

  // Messaging status (local)
  status?: UserStatus;
  lastSeenAt?: string;

  // Settings (local)
  settings?: UserSettings;

  // Timestamps
  createdAt: string;
  lastSyncedAt?: string;
}

/**
 * Minimal user interface for search results.
 * Used in user picker, search results, etc.
 */
export interface UserSearchResult {
  id: string;
  tmsUserId: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  username?: string;
  image?: string;
  positionTitle?: string;
  division?: string;
  department?: string;
  section?: string;
  customTeam?: string;
  isActive: boolean;
}

/**
 * User profile (public view).
 * Used when viewing other users' profiles.
 */
export interface UserProfile {
  id: string;
  tmsUserId: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  image?: string;
  role: TMSRole;
  positionTitle?: string;
  division?: string;
  department?: string;
  section?: string;
  customTeam?: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
  privacy: {
    readReceipts: boolean;
    lastSeen: boolean;
    profilePhoto: 'everyone' | 'contacts' | 'nobody';
  };
}

export interface UserPresence {
  userId: string;
  status: UserStatus;
  lastSeenAt?: string;
}

/**
 * Search filters for user search.
 */
export interface UserSearchFilters {
  division?: string;
  department?: string;
  section?: string;
  role?: TMSRole;
  isActive?: boolean;
}

/**
 * User search request parameters.
 */
export interface UserSearchParams {
  query: string;
  limit?: number;
  filters?: UserSearchFilters;
}

// Utility functions

/**
 * Map TMS role to internal role type.
 */
export const mapTMSRole = (tmsRole: TMSRole): UserRole => {
  const roleMap: Record<TMSRole, UserRole> = {
    ADMIN: 'admin',
    LEADER: 'leader',
    MEMBER: 'member',
  };
  return roleMap[tmsRole] || 'member';
};

/**
 * Get display name from user data.
 * Priority: displayName > name > firstName + lastName > email
 */
export const getUserDisplayName = (user: Partial<User>): string => {
  if (user.displayName) return user.displayName;
  if (user.name) return user.name;
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;
  return user.email || 'Unknown User';
};

/**
 * Get user initials for avatar placeholder.
 */
export const getUserInitials = (user: Partial<User>): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  if (user.displayName) {
    const parts = user.displayName.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return user.displayName.substring(0, 2).toUpperCase();
  }
  if (user.email) {
    return user.email.substring(0, 2).toUpperCase();
  }
  return 'U';
};

/**
 * Check if user is admin.
 */
export const isAdmin = (user: User): boolean => {
  return user.role === 'ADMIN';
};

/**
 * Check if user is leader.
 */
export const isLeader = (user: User): boolean => {
  return user.role === 'LEADER' || user.isLeader;
};

/**
 * Get full organizational path.
 */
export const getOrganizationPath = (user: User): string => {
  const parts = [user.division, user.department, user.section, user.customTeam].filter(Boolean);
  return parts.join(' > ');
};
