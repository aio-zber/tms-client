/**
 * Authentication Service
 * Handles authentication with GCGC Team Management System
 * Uses session-based authentication
 */

import { STORAGE_KEYS } from '@/lib/constants';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: {
    id: string;
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
      // First, try to authenticate with the GCGC Team Management System signin endpoint
      const signinResponse = await fetch(`${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/auth/signin/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: new URLSearchParams({
          email: credentials.email,
          password: credentials.password,
          redirect: 'false',
          json: 'true'
        }).toString(),
      });

      if (!signinResponse.ok) {
        throw new AuthError('Invalid credentials', signinResponse.status);
      }

      // Get user session info
      const userResponse = await fetch(`${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/users/me`, {
        credentials: 'include',
      });

      if (!userResponse.ok) {
        throw new AuthError('Failed to get user info', userResponse.status);
      }

      const userData = await userResponse.json();

      // Store session indicator
      this.setSessionActive(true);
      
      return {
        success: true,
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.displayName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.username || 'User',
          role: userData.role || 'MEMBER'
        }
      };

    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error. Please check your connection.');
    }
  }

  /**
   * Logout user.
   * Clears session and stored data.
   */
  async logout(): Promise<void> {
    try {
      // Call GCGC Team Management System signout endpoint
      await fetch(`${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/auth/signout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.warn('Team Management System logout failed:', error);
    } finally {
      this.setSessionActive(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        localStorage.removeItem('tms_session_active');
      }
    }
  }

  /**
   * Get current user from GCGC Team Management System API.
   */
  async getCurrentUser() {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/users/me`, {
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
   * Validate session by attempting to fetch current user.
   * @returns True if session is valid
   */
  async validateSession(): Promise<boolean> {
    if (!this.isAuthenticated()) return false;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/users/me`, {
        credentials: 'include',
      });

      const isValid = response.ok;
      if (!isValid) {
        this.setSessionActive(false);
      }
      return isValid;
    } catch {
      this.setSessionActive(false);
      return false;
    }
  }

  /**
   * Get stored access token (compatibility method).
   */
  getStoredToken(): string | null {
    // For session-based auth, we don't store tokens
    // but return session indicator for compatibility
    return this.isAuthenticated() ? 'session-active' : null;
  }
}

// Export singleton instance
export const authService = new AuthService();

// Export default for testing
export default AuthService;
