/**
 * Auth Store (Zustand)
 * Manages authentication state and actions
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { authService, LoginCredentials, AuthError } from '@/features/auth/services/authService';
import { userService } from '@/features/users';

interface AuthState {
  // State
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  setToken: (token: string | null) => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

/**
 * Auth Store
 *
 * Usage:
 * ```tsx
 * import { useAuthStore } from '@/store/authStore';
 *
 * function Component() {
 *   const { login, logout, isAuthenticated } = useAuthStore();
 *   // ...
 * }
 * ```
 */
export const useAuthStore = create<AuthState>()(
  devtools(
    (set, _get: () => AuthState) => ({
      // Initial state
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      /**
       * Login with email and password.
       * On success, fetches current user and stores token.
       */
      login: async (credentials) => {
        set({ isLoading: true, error: null });

        try {
          // Call TMS login API
          const response = await authService.login(credentials);

          // Set session state in store
          set({
            token: 'session-active', // Session-based auth doesn't use tokens
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Fetch current user data
          // This will populate the user store
          try {
            await userService.getCurrentUser();
          } catch (userError) {
            console.error('Failed to fetch user after login:', userError);
            // Continue anyway - user data will be fetched on next request
          }
        } catch (error) {
          console.error('Login error:', error);

          const errorMessage =
            error instanceof AuthError
              ? error.message
              : 'Login failed. Please try again.';

          set({
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });

          throw error;
        }
      },

      /**
       * Logout user.
       * Clears token, user data, and all caches.
       */
      logout: () => {
        authService.logout();
        userService.clearCache();

        set({
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      /**
       * Set authentication token manually.
       */
      setToken: (token) => {
        if (token) {
          authService.setSessionActive(true);
          set({
            token,
            isAuthenticated: true,
          });
        } else {
          authService.logout();
          set({
            token: null,
            isAuthenticated: false,
          });
        }
      },

      /**
       * Check authentication status.
       * Validates session and updates state accordingly.
       */
      checkAuth: async () => {
        set({ isLoading: true });

        try {
          const isAuthenticated = authService.isAuthenticated();

          if (!isAuthenticated) {
            set({
              token: null,
              isAuthenticated: false,
              isLoading: false,
            });
            return;
          }

          // Validate session by attempting to use it
          const isValid = await authService.validateSession();

          if (isValid) {
            set({
              token: 'session-active',
              isAuthenticated: true,
              isLoading: false,
            });

            // Fetch user data if authenticated
            try {
              await userService.getCurrentUser();
            } catch {
              // User data fetch failed, but session is valid
              // Continue with authentication
            }
          } else {
            // Session is invalid, clear everything
            await authService.logout();
            set({
              token: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } catch (error) {
          console.error('Auth check failed:', error);

          // On error, assume not authenticated
          await authService.logout();
          set({
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      /**
       * Clear error message.
       */
      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'AuthStore' }
  )
);

// Selectors for optimized re-renders
export const selectToken = (state: AuthState) => state.token;
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectIsLoading = (state: AuthState) => state.isLoading;
export const selectError = (state: AuthState) => state.error;
