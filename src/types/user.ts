/**
 * User-related type definitions
 * Note: User data comes from TMS and is view-only
 */

export type UserStatus = 'online' | 'away' | 'offline';

export type UserRole = 'admin' | 'user' | 'guest';

export interface User {
  id: string;
  tmsUserId: string; // Reference to TMS user ID
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  avatarUrl?: string;
  position?: string;
  role: UserRole;
  status: UserStatus;
  lastSeenAt?: string;
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
