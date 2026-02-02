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
 * @returns API base URL (e.g., "https://tms-chat-staging.example.com/api/v1")
 */
export const getApiUrl = (): string => {
  // Log every call for debugging
  log.debug('[Runtime Config] getApiUrl() called, current cache:', apiUrlCache);

  // Return cached value if already determined
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
      log.debug('[Runtime Config] ✅ Detected localhost, setting cache to:', apiUrlCache);
      return apiUrlCache;
    }

    // Alibaba Cloud Production (example.com)
    if (hostname === 'tms-chat.example.com') {
      apiUrlCache = 'https://tms-chat.example.com/api/v1';
      log.debug('[Runtime Config] ✅ Detected Alibaba Cloud Production, setting cache to:', apiUrlCache);
      return apiUrlCache;
    }

    // Alibaba Cloud Staging
    if (hostname === 'tms-chat-staging.example.com') {
      apiUrlCache = 'https://tms-chat-staging.example.com/api/v1';
      log.debug('[Runtime Config] ✅ Detected Alibaba Cloud Staging, setting cache to:', apiUrlCache);
      return apiUrlCache;
    }

    // Unknown domain - use Alibaba Cloud staging as fallback
    apiUrlCache = 'https://tms-chat-staging.example.com/api/v1';
    log.debug('[Runtime Config] ⚠️ Unknown hostname, using Alibaba Cloud staging as default:', apiUrlCache);
    return apiUrlCache;
  }

  // Server-side rendering fallback - use Alibaba Cloud staging
  log.debug('[Runtime Config] SSR fallback, returning Alibaba Cloud staging');
  return 'https://tms-chat-staging.example.com/api/v1';
};

/**
 * Get WebSocket base URL based on runtime hostname detection
 *
 * @returns WebSocket base URL (e.g., "wss://tms-chat-staging.example.com")
 */
export const getWebSocketUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'ws://localhost:8000';
    }

    // Alibaba Cloud Production
    if (hostname === 'tms-chat.example.com') {
      return 'wss://tms-chat.example.com';
    }

    // Alibaba Cloud Staging
    if (hostname === 'tms-chat-staging.example.com') {
      return 'wss://tms-chat-staging.example.com';
    }

    // Unknown domain - use Alibaba Cloud staging as fallback
    return 'wss://tms-chat-staging.example.com';
  }

  // Server-side fallback
  return 'ws://localhost:8000';
};
