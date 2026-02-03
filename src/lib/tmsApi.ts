/**
 * TMS (Team Management System) API Client
 * Handles authentication and user data through TMS Server
 * All requests go through TMS Server which communicates with GCGC
 */

import { log } from '@/lib/logger';
import { getApiBaseUrl, STORAGE_KEYS } from './constants';
import { User } from '@/types';

export interface TMSUser {
  id: string;
  tmsUserId?: string; // TMS user ID (returned by backend via serialization_alias)
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  name?: string;
  displayName?: string;
  image?: string;
  role: 'ADMIN' | 'LEADER' | 'MEMBER';
  positionTitle?: string;
  division?: string;
  department?: string;
  section?: string;
  customTeam?: string;
  hierarchyLevel?: string;
  reportsToId?: string;
  isActive: boolean;
  isLeader: boolean;
}

export interface AuthResponse {
  token: string;
  user: TMSUser;
  expiresAt: string;
}

// TMS API can return user search results in different formats
type TMSUserSearchResponse =
  | TMSUser[]
  | { users: TMSUser[] }
  | { data: TMSUser[] }
  | { results: TMSUser[] };

export class TMSApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'TMSApiError';
  }
}

class TMSApiClient {
  private baseURL: string;

  constructor() {
    // Use TMS Server API, not GCGC directly
    // This avoids CORS issues and uses proper JWT authentication
    this.baseURL = getApiBaseUrl();
  }

  /**
   * Get authentication token from localStorage.
   */
  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  }

  /**
   * Get default headers including authentication.
   */
  private getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Handle API response and errors.
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.message || errorMessage;
      } catch {
        if (errorText) {
          errorMessage = errorText;
        }
      }

      throw new TMSApiError(errorMessage, response.status, errorText);
    }

    if (response.status === 204) {
      return {} as T;
    }

    try {
      return await response.json();
    } catch (error) {
      throw new TMSApiError('Invalid JSON response', response.status);
    }
  }

  /**
   * Get current user data from TMS Server.
   */
  async getCurrentUser(): Promise<TMSUser> {
    const response = await fetch(`${this.baseURL}/users/me`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    return this.handleResponse<TMSUser>(response);
  }

  /**
   * Get specific user by ID from TMS Server.
   */
  async getUserById(id: string): Promise<TMSUser> {
    const response = await fetch(`${this.baseURL}/users/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    return this.handleResponse<TMSUser>(response);
  }

  /**
   * Search users through TMS Server.
   */
  async searchUsers(query: string, limit: number = 20): Promise<TMSUser[]> {
    const url = new URL(`${this.baseURL}/users/`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', limit.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
    });

    const data = await this.handleResponse<TMSUserSearchResponse>(response);

    // Handle different response formats from TMS API
    // Format 1: Direct array [...]
    // Format 2: { users: [...] }
    // Format 3: { data: [...] }
    // Format 4: { results: [...] }
    if (Array.isArray(data)) {
      return data;
    } else if ('users' in data && Array.isArray(data.users)) {
      return data.users;
    } else if ('data' in data && Array.isArray(data.data)) {
      return data.data;
    } else if ('results' in data && Array.isArray(data.results)) {
      return data.results;
    } else {
      log.error('Unexpected TMS API response format:', data);
      return [];
    }
  }

  /**
   * Set authentication token (from external auth system).
   */
  setAuthToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    }
  }

  /**
   * Logout and clear stored token.
   */
  async logout(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    }
  }

  /**
   * Check if user is authenticated.
   */
  isAuthenticated(): boolean {
    return !!this.getAuthToken();
  }

  /**
   * Transform TMS user data to internal User type.
   */
  transformTMSUser(tmsUser: TMSUser): User {
    return {
      id: tmsUser.id, // Use TMS ID as local ID for now
      tmsUserId: tmsUser.id,
      email: tmsUser.email,
      username: tmsUser.username,
      firstName: tmsUser.firstName,
      lastName: tmsUser.lastName,
      middleName: tmsUser.middleName,
      name: tmsUser.name,
      displayName: tmsUser.displayName || tmsUser.name || `${tmsUser.firstName || ''} ${tmsUser.lastName || ''}`.trim() || tmsUser.email,
      image: tmsUser.image,
      role: tmsUser.role,
      positionTitle: tmsUser.positionTitle,
      division: tmsUser.division,
      department: tmsUser.department,
      section: tmsUser.section,
      customTeam: tmsUser.customTeam,
      hierarchyLevel: tmsUser.hierarchyLevel,
      reportsToId: tmsUser.reportsToId,
      isActive: tmsUser.isActive,
      isLeader: tmsUser.isLeader,
      status: 'online', // Default status
      createdAt: new Date().toISOString(), // Will be replaced with actual data later
    };
  }
}

// Export singleton instance
export const tmsApi = new TMSApiClient();

// Export default for convenience
export default tmsApi;