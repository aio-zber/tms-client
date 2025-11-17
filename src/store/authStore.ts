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
  autoLoginFromGCGC: () => Promise<void>;
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
          await authService.login(credentials);

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
       * Auto-login from GCGC session (SSO).
       * Detects GCGC session cookie and exchanges for TMS JWT.
       */
      autoLoginFromGCGC: async () => {
        set({ isLoading: true, error: null });

        try {
          console.log('🔐 SSO: Starting auto-login from GCGC...');

          // Call auto-login method
          await authService.autoLoginFromGCGC();

          // Set session state in store
          set({
            token: 'session-active',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          console.log('✅ SSO: Auto-login successful');

          // Fetch current user data
          try {
            await userService.getCurrentUser();
          } catch (userError) {
            console.error('SSO: Failed to fetch user after auto-login:', userError);
            // Continue anyway - user data will be fetched on next request
          }
        } catch (error) {
          console.error('❌ SSO: Auto-login error:', error);

          const errorMessage =
            error instanceof AuthError
              ? error.message
              : 'SSO authentication failed. Please try logging in again.';

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
            // Additional check: Verify user ID hasn't changed
            try {
              const userData = await userService.getCurrentUser();
              const storedUserId = typeof window !== 'undefined'
                ? localStorage.getItem('current_user_id')
                : null;

              if (storedUserId && userData?.tms_user_id && userData.tms_user_id !== storedUserId) {
                console.log('Auth check: User ID changed, clearing session');
                await authService.logout();
                set({
                  token: null,
                  isAuthenticated: false,
                  isLoading: false,
                });
                return;
              }

              // Update stored user ID if needed
              if (typeof window !== 'undefined' && userData?.tms_user_id) {
                localStorage.setItem('current_user_id', userData.tms_user_id);
              }
            } catch {
              // User data fetch failed, but session is valid
              // Continue with authentication
            }

            set({
              token: 'session-active',
              isAuthenticated: true,
              isLoading: false,
            });
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
