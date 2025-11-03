/**
 * Authentication Service
 * Handles authentication with GCGC Team Management System
 * Uses session-based authentication
 */

import { STORAGE_KEYS, getApiBaseUrl } from '@/lib/constants';

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
      console.log('🔐 Step 1: Authenticating with GCGC...');

      // Step 1: Browser authenticates with GCGC signin endpoint
      // This establishes session cookies in the browser
      const signinResponse = await fetch(
        `${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/auth/signin/credentials`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          credentials: 'include', // Include cookies for session
          body: new URLSearchParams({
            email: credentials.email,
            password: credentials.password,
            redirect: 'false',
            json: 'true'
          }).toString(),
        }
      );

      if (!signinResponse.ok) {
        const errorData = await signinResponse.json().catch(() => ({}));
        const errorMessage = errorData.error || 'Authentication failed with GCGC';
        console.error('❌ GCGC authentication failed:', errorMessage);
        throw new AuthError(errorMessage, signinResponse.status);
      }

      console.log('✅ Step 1 complete: GCGC session established');
      console.log('🔐 Step 2: Getting JWT token from GCGC...');

      // Step 2: Get JWT token from GCGC using the established session
      // Browser automatically sends session cookies
      const tokenResponse = await fetch(
        `${process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL}/api/v1/auth/token`,
        {
          credentials: 'include', // Include session cookies
        }
      );

      if (!tokenResponse.ok) {
        console.error('❌ Failed to get JWT token from GCGC');
        throw new AuthError('Failed to get authentication token', tokenResponse.status);
      }

      const tokenData = await tokenResponse.json();
      const jwtToken = tokenData.token;

      if (!jwtToken) {
        throw new AuthError('No JWT token received from GCGC');
      }

      // Store JWT token in localStorage for TMS Server API requests
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, jwtToken);
        console.log('✅ Step 2 complete: JWT token stored');
      }

      console.log('🔐 Step 3: Authenticating with TMS Server...');

      // Step 3: Authenticate with TMS Server using the JWT token
      const apiBaseUrl = getApiBaseUrl();
      const backendAuthResponse = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token: jwtToken }),
      });

      if (!backendAuthResponse.ok) {
        const errorData = await backendAuthResponse.json().catch(() => ({}));
        const errorMessage = errorData.detail?.message || errorData.message || 'TMS Server authentication failed';
        console.error('❌ TMS Server authentication failed:', errorMessage);
        throw new AuthError(errorMessage, backendAuthResponse.status);
      }

      const backendData = await backendAuthResponse.json();
      const userData = backendData.user;

      console.log('✅ Step 3 complete: TMS Server authentication successful');

      // Store session indicator
      this.setSessionActive(true);

      return {
        success: true,
        user: {
          id: userData.tms_user_id || userData.id,
          email: userData.email,
          name: userData.display_name || userData.name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || userData.username || 'User',
          role: userData.role || 'MEMBER'
        }
      };

    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      console.error('❌ Login error:', error);
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
        // Clear all stored auth data
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN); // Clear JWT token
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        localStorage.removeItem('tms_session_active');
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
  private extractSessionToken(): string | null {
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
