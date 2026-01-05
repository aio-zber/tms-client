/**
 * Cache versioning to handle schema migrations
 * Increment CACHE_VERSION when message schema changes (e.g., adding sequenceNumber)
 */

const CACHE_VERSION_KEY = 'tms_cache_version';
const CURRENT_CACHE_VERSION = 2; // Increment when schema changes

/**
 * Check if cache needs to be cleared due to version mismatch
 * Call this on app initialization
 */
export function shouldClearCache(): boolean {
  const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
  const storedVersionNum = storedVersion ? parseInt(storedVersion, 10) : 0;

  return storedVersionNum < CURRENT_CACHE_VERSION;
}

/**
 * Update cache version in localStorage
 */
export function updateCacheVersion(): void {
  localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION.toString());
}

/**
 * Clear TanStack Query cache if version has changed
 */
export function checkAndClearCache(queryClient: { clear: () => void }): void {
  if (shouldClearCache()) {
    console.log(`[Cache] Version mismatch - clearing cache (${CURRENT_CACHE_VERSION})`);
    queryClient.clear();
    updateCacheVersion();
  }
}
