/**
 * Authentication Service
 * Handles authentication with GCGC Team Management System
 * Uses session-based authentication
 */

import { STORAGE_KEYS, getApiBaseUrl } from '@/lib/constants';
import { log } from '@/lib/logger';
import { socketClient } from '@/lib/socket';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: {
    id: string;
    tmsUserId: string;  // TMS CUID from backend
    email: string;
    name: string;
    role: string;
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

class AuthService {
  /**
   * Login with TMS credentials using session-based authentication.
   * @param credentials Email and password
   * @returns User session info
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const apiBaseUrl = getApiBaseUrl();
      log.auth.info('🔐 Authenticating with TMS Server...');

      // Single call to TMS-Server - handles GCGC auth server-to-server
      // This avoids browser CORS issues by keeping GCGC communication server-side
      const response = await fetch(`${apiBaseUrl}/auth/login/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail?.message || errorData.message || 'Authentication failed';
        log.auth.error('❌ Authentication failed:', errorMessage);
        throw new AuthError(errorMessage, response.status);
      }

      const data = await response.json();
      log.auth.info('✅ Authentication successful');

      // Extract JWT token and user data from TMS-Server response
      const jwtToken = data.token;
      const userData = data.user;

      // Validate response has required fields
      if (!userData.id || !userData.tmsUserId) {
        log.auth.error('❌ Backend response missing required ID fields', {
          hasId: !!userData.id,
          hasTmsUserId: !!userData.tmsUserId
        });
        throw new AuthError('Invalid user data from backend');
      }

      // Store JWT token in localStorage for API requests
      if (typeof window !== 'undefined' && jwtToken) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, jwtToken);
        log.auth.info('✅ JWT token stored');
      }

      // Store session indicator
      this.setSessionActive(true);

      return {
        success: true,
        user: {
          id: userData.id,                    // Local UUID (camelCase from backend)
          tmsUserId: userData.tmsUserId,      // TMS CUID (camelCase from backend)
          email: userData.email,
          name: userData.displayName || userData.name ||
                `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
                userData.username || 'User',
          role: userData.role || 'MEMBER'
        }
      };

    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      log.auth.error('❌ Login error:', error);
      throw new AuthError('Network error. Please check your connection.');
    }
  }

  /**
   * Auto-login using GCGC NextAuth session token (SSO).
   * Called when GCGC session is detected but TMS is not logged in.
   * @returns User session info
   */
  async autoLoginFromGCGC(): Promise<LoginResponse> {
    try {
      log.auth.info('🔐 SSO: Attempting auto-login from GCGC session...');

      // Extract GCGC NextAuth session token from cookies
      const gcgcSessionToken = this.extractSessionToken();

      if (!gcgcSessionToken) {
        log.auth.error('❌ SSO: No GCGC session token found');
        throw new AuthError('No GCGC session found', 401);
      }

      log.auth.info('✅ SSO: GCGC session token detected');

      // Exchange GCGC session token for TMS JWT via SSO endpoint
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/auth/login/sso`, {
        method: 'POST',
        headers: {
          'X-GCGC-Session-Token': gcgcSessionToken,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail?.message || errorData.message || 'SSO authentication failed';
        log.auth.error('❌ SSO: Authentication failed:', errorMessage);
        throw new AuthError(errorMessage, response.status);
      }

      const data = await response.json();
      log.auth.info('✅ SSO: Authentication successful');

      // Extract JWT token and user data from TMS-Server response
      const jwtToken = data.token;
      const userData = data.user;

      // Validate response has required fields
      if (!userData.id || !userData.tmsUserId) {
        log.auth.error('❌ SSO: Backend response missing required ID fields', {
          hasId: !!userData.id,
          hasTmsUserId: !!userData.tmsUserId
        });
        throw new AuthError('Invalid user data from backend');
      }

      // Store JWT token in localStorage for API requests
      if (typeof window !== 'undefined' && jwtToken) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, jwtToken);
        log.auth.info('✅ SSO: JWT token stored');
      }

      // Store session indicator
      this.setSessionActive(true);

      return {
        success: true,
        user: {
          id: userData.id,                    // Local UUID (camelCase from backend)
          tmsUserId: userData.tmsUserId,      // TMS CUID (camelCase from backend)
          email: userData.email,
          name: userData.displayName || userData.name ||
                `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
                userData.username || 'User',
          role: userData.role || 'MEMBER'
        }
      };

    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      log.auth.error('❌ SSO: Auto-login error:', error);
      throw new AuthError('SSO authentication failed. Please try logging in again.');
    }
  }

  /**
   * Logout user.
   * Clears session and stored data.
   */
  async logout(): Promise<void> {
    try {
      // Call TMS Server logout endpoint
      const apiBaseUrl = getApiBaseUrl();
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      log.auth.warn('TMS Server logout failed:', error);
    } finally {
      // CRITICAL: Disconnect socket BEFORE clearing tokens
      // This ensures the old user's socket connection is terminated
      // and prevents the new user from receiving old user's messages
      socketClient.disconnect();

      this.setSessionActive(false);
      if (typeof window !== 'undefined') {
        // Clear all stored auth data
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN); // Clear JWT token
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        localStorage.removeItem('tms_session_active');
        localStorage.removeItem('current_user_id'); // Clear user ID to prevent stale session
      }
    }
  }

  /**
   * Get current user from TMS Server API.
   * Uses JWT token stored in localStorage.
   */
  async getCurrentUser() {
    try {
      const jwtToken = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) : null;

      if (!jwtToken) {
        throw new AuthError('No authentication token found', 401);
      }

      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new AuthError('Failed to get current user', response.status);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error while fetching user data');
    }
  }

  /**
   * Set session active indicator.
   */
  setSessionActive(active: boolean): void {
    if (typeof window === 'undefined') return;
    if (active) {
      localStorage.setItem('tms_session_active', 'true');
    } else {
      localStorage.removeItem('tms_session_active');
    }
  }

  /**
   * Check if user session is active.
   */
  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('tms_session_active') === 'true';
  }

  /**
   * Validate session by attempting to fetch current user from TMS Server.
   * @returns True if session is valid
   */
  async validateSession(): Promise<boolean> {
    if (!this.isAuthenticated()) return false;

    try {
      const jwtToken = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) : null;

      if (!jwtToken) {
        this.setSessionActive(false);
        return false;
      }

      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const isValid = response.ok;
      if (!isValid) {
        this.setSessionActive(false);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        }
      }
      return isValid;
    } catch {
      this.setSessionActive(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      }
      return false;
    }
  }

  /**
   * Extract NextAuth session token from cookies.
   * NextAuth typically stores the session token in cookies with names like:
   * - next-auth.session-token (production)
   * - __Secure-next-auth.session-token (secure)
   */
  extractSessionToken(): string | null {
    if (typeof document === 'undefined') return null;

    const cookies = document.cookie.split(';');

    // Common NextAuth cookie names
    const tokenNames = [
      'next-auth.session-token',
      '__Secure-next-auth.session-token',
      '__Host-next-auth.session-token',
      'authjs.session-token',
      '__Secure-authjs.session-token',
    ];

    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (tokenNames.includes(name) && value) {
        return decodeURIComponent(value);
      }
    }

    return null;
  }

  /**
   * Get stored access token (compatibility method).
   */
  getStoredToken(): string | null {
    // Try to extract session token from cookies first
    const sessionToken = this.extractSessionToken();
    if (sessionToken) return sessionToken;

    // Otherwise return session indicator for compatibility
    return this.isAuthenticated() ? 'session-active' : null;
  }
}

// Export singleton instance
export const authService = new AuthService();

// Export default for testing
export default AuthService;
