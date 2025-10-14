/**
 * User Store (Zustand)
 * Manages user state, authentication, and user data caching.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { User, UserSearchResult, UserSearchParams } from '@/types/user';
import { userService } from '@/features/users';

interface UserState {
  // Current authenticated user
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // User cache (keyed by user ID)
  users: Record<string, User>;

  // Search results cache
  searchResults: UserSearchResult[];
  searchQuery: string;
  isSearching: boolean;

  // Actions
  fetchCurrentUser: () => Promise<void>;
  setCurrentUser: (user: User | null) => void;
  updateCurrentUser: (updates: Partial<User>) => void;

  // User operations
  fetchUserById: (userId: string) => Promise<User | null>;
  cacheUser: (user: User) => void;
  getCachedUser: (userId: string) => User | null;

  // Search operations
  searchUsers: (params: UserSearchParams) => Promise<void>;
  clearSearchResults: () => void;

  // Utility
  logout: () => void;
  reset: () => void;
}

/**
 * User Store
 *
 * Usage:
 * ```tsx
 * import { useUserStore } from '@/store/userStore';
 *
 * function Component() {
 *   const { currentUser, fetchCurrentUser } = useUserStore();
 *
 *   useEffect(() => {
 *     fetchCurrentUser();
 *   }, []);
 *
 *   return <div>Welcome, {currentUser?.displayName}</div>;
 * }
 * ```
 */
export const useUserStore = create<UserState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentUser: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      users: {},
      searchResults: [],
      searchQuery: '',
      isSearching: false,

      /**
       * Fetch current authenticated user from API.
       * Automatically called on app initialization.
       */
      fetchCurrentUser: async () => {
        set({ isLoading: true, error: null });

        try {
          // Try to get cached user first for instant UI
          const cachedUser = userService.getCachedCurrentUser();
          if (cachedUser) {
            set({
              currentUser: cachedUser,
              isAuthenticated: true,
              isLoading: true, // Keep loading while fetching fresh data
            });
          }

          // Fetch fresh data from API
          const user = await userService.getCurrentUser();

          set({
            currentUser: user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Cache the user
          get().cacheUser(user);
        } catch (error: unknown) {
          console.error('Failed to fetch current user:', error);

          // If we have cached data and the error is network-related, keep using cache
          const currentState = get();
          if (currentState.currentUser && ((error as { statusCode?: number }).statusCode === undefined || (error as { statusCode?: number }).statusCode! >= 500)) {
            set({
              isLoading: false,
              error: 'Using cached data (offline)',
            });
          } else {
            set({
              currentUser: null,
              isAuthenticated: false,
              isLoading: false,
              error: (error as Error).message || 'Failed to authenticate',
            });
          }
        }
      },

      /**
       * Set current user (use for login).
       */
      setCurrentUser: (user) => {
        set({
          currentUser: user,
          isAuthenticated: !!user,
        });

        if (user) {
          get().cacheUser(user);
        }
      },

      /**
       * Update current user with partial data.
       */
      updateCurrentUser: (updates) => {
        const { currentUser } = get();
        if (!currentUser) return;

        const updatedUser = { ...currentUser, ...updates };
        set({ currentUser: updatedUser });
        get().cacheUser(updatedUser);
      },

      /**
       * Fetch user by ID and cache result.
       */
      fetchUserById: async (userId) => {
        const { users } = get();

        // Return cached if available
        if (users[userId]) {
          return users[userId];
        }

        try {
          const user = await userService.getUserById(userId);
          get().cacheUser(user as User); // UserProfile is compatible with User
          return user as User;
        } catch (error) {
          console.error(`Failed to fetch user ${userId}:`, error);
          return null;
        }
      },

      /**
       * Cache user in store.
       */
      cacheUser: (user) => {
        set((state) => ({
          users: {
            ...state.users,
            [user.id]: user,
            [user.tmsUserId]: user, // Also cache by TMS ID
          },
        }));
      },

      /**
       * Get cached user by ID.
       */
      getCachedUser: (userId) => {
        return get().users[userId] || null;
      },

      /**
       * Search users with query and filters.
       */
      searchUsers: async (params) => {
        set({ isSearching: true, error: null, searchQuery: params.query });

        try {
          const results = await userService.searchUsers(params);

          set({
            searchResults: results,
            isSearching: false,
            error: null,
          });

          // Cache each search result
          results.forEach((user) => {
            get().cacheUser(user as User);
          });
        } catch (error: unknown) {
          console.error('User search failed:', error);
          set({
            searchResults: [],
            isSearching: false,
            error: (error as Error).message || 'Search failed',
          });
        }
      },

      /**
       * Clear search results.
       */
      clearSearchResults: () => {
        set({
          searchResults: [],
          searchQuery: '',
          error: null,
        });
      },

      /**
       * Logout current user.
       */
      logout: () => {
        userService.clearCache();
        set({
          currentUser: null,
          isAuthenticated: false,
          error: null,
          users: {},
          searchResults: [],
          searchQuery: '',
        });
      },

      /**
       * Reset store to initial state.
       */
      reset: () => {
        set({
          currentUser: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          users: {},
          searchResults: [],
          searchQuery: '',
          isSearching: false,
        });
      },
    }),
    { name: 'UserStore' }
  )
);

// Selectors for optimized re-renders
export const selectCurrentUser = (state: UserState) => state.currentUser;
export const selectIsAuthenticated = (state: UserState) => state.isAuthenticated;
export const selectIsLoading = (state: UserState) => state.isLoading;
export const selectError = (state: UserState) => state.error;
export const selectSearchResults = (state: UserState) => state.searchResults;
export const selectIsSearching = (state: UserState) => state.isSearching;
