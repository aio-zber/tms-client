/**
 * API Client for backend communication.
 * Centralized HTTP client with authentication and error handling.
 */

import { getApiBaseUrl, STORAGE_KEYS } from './constants';
import { authService } from '@/features/auth/services/authService';

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  /**
   * Get base URL dynamically at runtime to ensure correct HTTPS usage.
   * This prevents build-time env var issues in Railway deployments.
   */
  private getBaseURL(): string {
    return getApiBaseUrl();
  }

  /**
   * Get authentication token from localStorage or authService.
   */
  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;

    // Try to get token from authService (session-based)
    const sessionToken = authService.getStoredToken();
    if (sessionToken && sessionToken !== 'session-active') {
      return sessionToken;
    }

    // Fallback to localStorage (token-based)
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
        // If response is not JSON, use text as message
        if (errorText) {
          errorMessage = errorText;
        }
      }

      throw new ApiError(errorMessage, response.status, errorText);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    try {
      return await response.json();
    } catch (error) {
      throw new ApiError('Invalid JSON response', response.status);
    }
  }

  /**
   * Perform GET request.
   */
  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = new URL(`${this.getBaseURL()}${endpoint}`);

    // Add query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookies
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Perform POST request.
   */
  async post<T, D = unknown>(endpoint: string, data?: D): Promise<T> {
    const response = await fetch(`${this.getBaseURL()}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookies
      body: data ? JSON.stringify(data) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Perform PUT request.
   */
  async put<T, D = unknown>(endpoint: string, data?: D): Promise<T> {
    const response = await fetch(`${this.getBaseURL()}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookies
      body: data ? JSON.stringify(data) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Perform PATCH request.
   */
  async patch<T, D = unknown>(endpoint: string, data?: D): Promise<T> {
    const response = await fetch(`${this.getBaseURL()}${endpoint}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookies
      body: data ? JSON.stringify(data) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Perform DELETE request.
   */
  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.getBaseURL()}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookies
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Upload file with multipart/form-data.
   */
  async uploadFile<T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string>
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const token = this.getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.getBaseURL()}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include', // Include session cookies
      body: formData,
    });

    return this.handleResponse<T>(response);
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export default for convenience
export default apiClient;
