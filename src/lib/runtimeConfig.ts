/**
 * Runtime API Configuration
 *
 * Uses hostname detection instead of build-time environment variables
 * to avoid Next.js NEXT_PUBLIC_ variable replacement issues.
 *
 * This ensures the correct backend URL is used regardless of when/where
 * the app was built, making it more reliable for Railway deployments.
 */

let apiUrlCache: string | null = null;

/**
 * Get API base URL based on runtime hostname detection
 *
 * @returns API base URL (e.g., "https://tms-server-staging.up.railway.app/api/v1")
 */
export const getApiUrl = (): string => {
  // Log every call for debugging
  console.log('[Runtime Config] getApiUrl() called, current cache:', apiUrlCache);

  // Return cached value if already determined
  if (apiUrlCache) {
    console.log('[Runtime Config] Returning cached URL:', apiUrlCache);
    return apiUrlCache;
  }

  // Client-side detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    console.log('[Runtime Config] Client-side detection, hostname:', hostname);

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      apiUrlCache = 'http://localhost:8000/api/v1';
      console.log('[Runtime Config] ✅ Detected localhost, setting cache to:', apiUrlCache);
      return apiUrlCache;
    }

    // Railway deployment (staging)
    if (hostname.includes('railway.app')) {
      apiUrlCache = 'https://tms-server-staging.up.railway.app/api/v1';
      console.log('[Runtime Config] ✅ Detected Railway deployment, setting cache to:', apiUrlCache);
      return apiUrlCache;
    }

    // Production or unknown domain - use staging as fallback
    apiUrlCache = 'https://tms-server-staging.up.railway.app/api/v1';
    console.log('[Runtime Config] ⚠️ Unknown hostname, using default:', apiUrlCache);
    return apiUrlCache;
  }

  // Server-side rendering fallback
  console.log('[Runtime Config] SSR fallback, returning default');
  return 'https://tms-server-staging.up.railway.app/api/v1';
};

/**
 * Get WebSocket base URL based on runtime hostname detection
 *
 * @returns WebSocket base URL (e.g., "wss://tms-server-staging.up.railway.app")
 */
export const getWebSocketUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'ws://localhost:8000';
    }

    // Railway deployment (staging)
    if (hostname.includes('railway.app')) {
      return 'wss://tms-server-staging.up.railway.app';
    }

    // Fallback
    return 'wss://tms-server-staging.up.railway.app';
  }

  // Server-side fallback
  return 'ws://localhost:8000';
};
