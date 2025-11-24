/**
 * Users Feature Exports
 * Centralized exports for user-related functionality.
 */

// Services
export { userService } from './services/userService';
export type { default as UserService } from './services/userService';

// Hooks
export { useCurrentUser, useUser, useUserSearch } from './hooks';
export { useUserProfile } from './hooks/useUserProfile';
export { useProfileSettings } from './hooks/useProfileSettings';

// Components
export { ProfileSettingsPage } from './components/ProfileSettingsPage';
export { UserProfileDialog } from './components/UserProfileDialog';
export { ProfileInfoCard } from './components/ProfileInfoCard';
export { ProfileSettingsForm } from './components/ProfileSettingsForm';
