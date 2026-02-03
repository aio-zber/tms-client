/**
 * Runtime API Configuration
 *
 * Uses hostname detection instead of build-time environment variables
 * to avoid Next.js NEXT_PUBLIC_ variable replacement issues.
 *
 * This ensures the correct backend URL is used regardless of when/where
 * the app was built.
 */

import { log } from './logger';

let apiUrlCache: string | null = null;

/**
 * Get API base URL based on runtime hostname detection
 *
 * @returns API base URL (e.g., "https://your-domain.com/api/v1")
 */
export const getApiUrl = (): string => {
  log.debug('[Runtime Config] getApiUrl() called, current cache:', apiUrlCache);

  if (apiUrlCache) {
    log.debug('[Runtime Config] Returning cached URL:', apiUrlCache);
    return apiUrlCache;
  }

  // Client-side detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    log.debug('[Runtime Config] Client-side detection, hostname:', hostname);

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      apiUrlCache = 'http://localhost:8000/api/v1';
      log.debug('[Runtime Config] Detected localhost, setting cache to:', apiUrlCache);
      return apiUrlCache;
    }

    // Production/staging: derive API URL from current hostname
    // The app uses same-origin reverse proxy (nginx forwards /api/v1 to backend)
    const protocol = window.location.protocol;
    apiUrlCache = `${protocol}//${hostname}/api/v1`;
    log.debug('[Runtime Config] Detected deployment hostname, setting cache to:', apiUrlCache);
    return apiUrlCache;
  }

  // Server-side rendering fallback
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  return 'http://localhost:8000/api/v1';
};

/**
 * Get WebSocket base URL based on runtime hostname detection
 *
 * @returns WebSocket base URL (e.g., "wss://your-domain.com")
 */
export const getWebSocketUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'ws://localhost:8000';
    }

    // Production/staging: derive WSS URL from current hostname
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${hostname}`;
  }

  // Server-side fallback
  const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envWsUrl) return envWsUrl;

  return 'ws://localhost:8000';
};
