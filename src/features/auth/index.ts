/**
 * Auth Feature Exports
 * Centralized exports for authentication functionality.
 */

// Services
export { authService, AuthError } from './services/authService';
export type { LoginCredentials, LoginResponse } from './services/authService';

// Hooks
export { useAuth } from './hooks/useAuth';
