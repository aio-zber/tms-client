/**
 * Auth Store (Zustand)
 * Manages authentication state and actions
 */

import { log } from '@/lib/logger';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { authService, LoginCredentials, AuthError } from '@/features/auth/services/authService';
import { userService } from '@/features/users';
import { useEncryptionStore } from '@/features/encryption/stores/keyStore';

interface AuthState {
  // State
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  autoLoginFromGCGC: () => Promise<void>;
  logout: () => Promise<void>;
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
      // Initial state — always false on first render (server + client both start the same).
      // checkAuth() runs in useEffect on mount and sets the real value from localStorage.
      // Reading localStorage here causes a server/client HTML mismatch (React error #418).
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

          // Fetch current user data and stamp current_user_id BEFORE E2EE init
          // so encryptionService.initialize() can detect cross-user contamination.
          try {
            const userData = await userService.getCurrentUser();
            if (typeof window !== 'undefined' && userData?.tmsUserId) {
              localStorage.setItem('current_user_id', userData.tmsUserId);
            }
          } catch (userError) {
            log.auth.error('Failed to fetch user after login:', userError);
            // Continue anyway - user data will be fetched on next request
          }

          // Initialize E2EE (non-blocking — app works without E2EE)
          try {
            const { encryptionService } = await import('@/features/encryption');
            await encryptionService.initialize();
          } catch (err) {
            log.auth.error('E2EE init failed:', err);
            useEncryptionStore.getState().setInitStatus('error', err instanceof Error ? err.message : String(err));
          }
        } catch (error) {
          log.auth.error('Login error:', error);

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
          log.auth.info('🔐 SSO: Starting auto-login from GCGC...');

          // Call auto-login method
          await authService.autoLoginFromGCGC();

          // Set session state in store
          set({
            token: 'session-active',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          log.auth.info('✅ SSO: Auto-login successful');

          // Fetch current user data and stamp current_user_id BEFORE E2EE init
          // so encryptionService.initialize() can detect cross-user contamination.
          try {
            const userData = await userService.getCurrentUser();
            if (typeof window !== 'undefined' && userData?.tmsUserId) {
              localStorage.setItem('current_user_id', userData.tmsUserId);
            }
          } catch (userError) {
            log.auth.error('SSO: Failed to fetch user after auto-login:', userError);
            // Continue anyway - user data will be fetched on next request
          }

          // Initialize E2EE (non-blocking — app works without E2EE)
          try {
            const { encryptionService } = await import('@/features/encryption');
            await encryptionService.initialize();
          } catch (err) {
            log.auth.error('SSO: E2EE init failed:', err);
            useEncryptionStore.getState().setInitStatus('error', err instanceof Error ? err.message : String(err));
          }
        } catch (error) {
          log.auth.error('❌ SSO: Auto-login error:', error);

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
       * Awaits E2EE cleanup before clearing session so no stale keys linger.
       */
      logout: async () => {
        // Await E2EE data and decryption cache cleanup before destroying the session
        try {
          const { encryptionService } = await import('@/features/encryption');
          await encryptionService.clearEncryptionData();
        } catch { /* ignore */ }

        try {
          const { clearDecryptionCache } = await import('@/features/messaging/hooks/useMessages');
          await clearDecryptionCache();
        } catch { /* ignore */ }

        await authService.logout();
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

          // Initialize E2EE after token is set (non-blocking)
          import('@/features/encryption')
            .then(({ encryptionService }) => encryptionService.initialize())
            .catch((err) => log.auth.error('E2EE init failed on setToken:', err));
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

              if (storedUserId && userData?.tmsUserId && userData.tmsUserId !== storedUserId) {
                log.auth.info('Auth check: User ID changed, clearing session');
                await authService.logout();
                set({
                  token: null,
                  isAuthenticated: false,
                  isLoading: false,
                });
                return;
              }

              // Update stored user ID if needed
              if (typeof window !== 'undefined' && userData?.tmsUserId) {
                localStorage.setItem('current_user_id', userData.tmsUserId);
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

            // Initialize E2EE for returning users (non-blocking)
            try {
              const { encryptionService } = await import('@/features/encryption');
              await encryptionService.initialize();
            } catch (err) {
              log.auth.error('E2EE init failed on checkAuth:', err);
              useEncryptionStore.getState().setInitStatus('error', err instanceof Error ? err.message : String(err));
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
          log.auth.error('Auth check failed:', error);

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
