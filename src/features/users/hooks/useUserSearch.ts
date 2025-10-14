/**
 * useUserSearch Hook
 * Hook for searching users with debouncing and caching.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserStore, selectSearchResults, selectIsSearching } from '@/store/userStore';
import { UserSearchParams, UserSearchFilters } from '@/types/user';
import { SEARCH_DEBOUNCE_DELAY } from '@/lib/constants';

/**
 * Hook for searching users with debouncing.
 * Automatically debounces search queries to avoid excessive API calls.
 *
 * @param initialFilters Optional initial search filters
 * @param debounceMs Debounce delay in milliseconds (default: 500ms)
 * @returns Search state and actions
 *
 * @example
 * ```tsx
 * function UserSearchComponent() {
 *   const {
 *     query,
 *     results,
 *     isSearching,
 *     error,
 *     search,
 *     clearSearch,
 *     setFilters,
 *   } = useUserSearch();
 *
 *   return (
 *     <div>
 *       <input
 *         value={query}
 *         onChange={(e) => search(e.target.value)}
 *         placeholder="Search users..."
 *       />
 *
 *       {isSearching && <div>Searching...</div>}
 *
 *       <div>
 *         {results.map((user) => (
 *           <div key={user.id}>
 *             {user.name} - {user.email}
 *           </div>
 *         ))}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUserSearch(
  initialFilters?: UserSearchFilters,
  debounceMs: number = SEARCH_DEBOUNCE_DELAY
) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<UserSearchFilters | undefined>(initialFilters);
  const [limit, setLimit] = useState(20);

  const results = useUserStore(selectSearchResults);
  const isSearching = useUserStore(selectIsSearching);
  const error = useUserStore((state) => state.error);
  const searchUsers = useUserStore((state) => state.searchUsers);
  const clearSearchResults = useUserStore((state) => state.clearSearchResults);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Perform search with current query and filters.
   */
  const performSearch = useCallback(() => {
    if (!query || query.trim().length === 0) {
      clearSearchResults();
      return;
    }

    const params: UserSearchParams = {
      query: query.trim(),
      limit,
      filters,
    };

    searchUsers(params);
  }, [query, limit, filters, searchUsers, clearSearchResults]);

  /**
   * Search with debouncing.
   */
  const search = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Clear results if query is empty
      if (!newQuery || newQuery.trim().length === 0) {
        clearSearchResults();
        return;
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        const params: UserSearchParams = {
          query: newQuery.trim(),
          limit,
          filters,
        };
        searchUsers(params);
      }, debounceMs);
    },
    [debounceMs, limit, filters, searchUsers, clearSearchResults]
  );

  /**
   * Search immediately without debouncing.
   */
  const searchImmediate = useCallback(() => {
    // Clear debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    performSearch();
  }, [performSearch]);

  /**
   * Clear search results and query.
   */
  const clearSearch = useCallback(() => {
    setQuery('');
    clearSearchResults();

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, [clearSearchResults]);

  /**
   * Update filters and trigger new search.
   */
  const updateFilters = useCallback(
    (newFilters: UserSearchFilters) => {
      setFilters(newFilters);

      // If there's an active query, re-search with new filters
      if (query && query.trim().length > 0) {
        // Debounce the filter change too
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          const params: UserSearchParams = {
            query: query.trim(),
            limit,
            filters: newFilters,
          };
          searchUsers(params);
        }, debounceMs);
      }
    },
    [query, limit, debounceMs, searchUsers]
  );

  /**
   * Update result limit.
   */
  const updateLimit = useCallback((newLimit: number) => {
    setLimit(newLimit);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    query,
    results,
    isSearching,
    error,
    filters,
    limit,
    search,
    searchImmediate,
    clearSearch,
    setFilters: updateFilters,
    setLimit: updateLimit,
  };
}
