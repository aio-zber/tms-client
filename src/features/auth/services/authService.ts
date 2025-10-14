/**
 * Authentication Service
 * Handles authentication with Team Management System (TMS)
 */

import { TMS_API_URL, STORAGE_KEYS } from '@/lib/constants';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
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
   * Login with TMS credentials.
   * @param credentials Email and password
   * @returns JWT tokens
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const response = await fetch(`${TMS_API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AuthError(
          errorData.message || errorData.detail || 'Login failed',
          response.status
        );
      }

      const data: LoginResponse = await response.json();

      // Store tokens
      this.setStoredToken(data.access_token);
      if (data.refresh_token) {
        this.setStoredRefreshToken(data.refresh_token);
      }

      return data;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Network error. Please check your connection.');
    }
  }

  /**
   * Logout user.
   * Clears all stored tokens and user data.
   */
  logout(): void {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem('refresh_token');
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
  }

  /**
   * Refresh access token using refresh token.
   * @returns New access token
   */
  async refreshToken(): Promise<string> {
    const refreshToken = this.getStoredRefreshToken();

    if (!refreshToken) {
      throw new AuthError('No refresh token available');
    }

    try {
      const response = await fetch(`${TMS_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        throw new AuthError('Token refresh failed', response.status);
      }

      const data: LoginResponse = await response.json();
      this.setStoredToken(data.access_token);

      return data.access_token;
    } catch (error) {
      // If refresh fails, clear all tokens
      this.logout();
      throw error;
    }
  }

  /**
   * Get stored access token.
   */
  getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  }

  /**
   * Set stored access token.
   */
  setStoredToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  }

  /**
   * Get stored refresh token.
   */
  getStoredRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refresh_token');
  }

  /**
   * Set stored refresh token.
   */
  setStoredRefreshToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('refresh_token', token);
  }

  /**
   * Check if user is authenticated (has valid token).
   */
  isAuthenticated(): boolean {
    return !!this.getStoredToken();
  }

  /**
   * Validate token by attempting to use it.
   * @returns True if token is valid
   */
  async validateToken(): Promise<boolean> {
    const token = this.getStoredToken();
    if (!token) return false;

    try {
      // Try to fetch current user to validate token
      const response = await fetch(`${TMS_API_URL}/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();

// Export default for testing
export default AuthService;
