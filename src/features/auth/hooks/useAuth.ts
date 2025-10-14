/**
 * useAuth Hook
 * Convenient hook for accessing authentication state and actions
 */

import { useEffect } from 'react';
import { useAuthStore, selectIsAuthenticated, selectIsLoading, selectError } from '@/store/authStore';
import { useUserStore, selectCurrentUser } from '@/store/userStore';
import { LoginCredentials } from '../services/authService';

/**
 * Hook for authentication.
 * Combines auth store and user store for convenient access.
 *
 * @param autoCheck Whether to automatically check auth on mount (default: true)
 * @returns Auth state and actions
 *
 * @example
 * ```tsx
 * function LoginPage() {
 *   const { login, isLoading, error } = useAuth(false);
 *
 *   const handleLogin = async (email, password) => {
 *     await login({ email, password });
 *     router.push('/chats');
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit(handleLogin)}>
 *       ...
 *     </form>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * function ProtectedPage() {
 *   const { isAuthenticated, user, logout } = useAuth();
 *
 *   if (!isAuthenticated) {
 *     return <Navigate to="/login" />;
 *   }
 *
 *   return (
 *     <div>
 *       <h1>Welcome, {user?.displayName}</h1>
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth(autoCheck: boolean = true) {
  // Auth store
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isLoading = useAuthStore(selectIsLoading);
  const error = useAuthStore(selectError);
  const loginAction = useAuthStore((state) => state.login);
  const logoutAction = useAuthStore((state) => state.logout);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const clearError = useAuthStore((state) => state.clearError);

  // User store
  const user = useUserStore(selectCurrentUser);

  // Auto-check authentication on mount
  useEffect(() => {
    if (autoCheck && !isAuthenticated && !isLoading) {
      checkAuth();
    }
  }, [autoCheck, isAuthenticated, isLoading, checkAuth]);

  /**
   * Login with credentials.
   * @throws AuthError if login fails
   */
  const login = async (credentials: LoginCredentials) => {
    await loginAction(credentials);
  };

  /**
   * Logout current user.
   * Clears all tokens and user data.
   */
  const logout = () => {
    logoutAction();
  };

  return {
    // State
    isAuthenticated,
    isLoading,
    error,
    user,

    // Actions
    login,
    logout,
    checkAuth,
    clearError,
  };
}
