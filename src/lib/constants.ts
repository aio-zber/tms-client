/**
 * Application Constants
 * Centralized configuration values used throughout the application
 */

// API Configuration
export const TMS_API_URL = process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL || 'https://gcgc-team-management-system-staging.up.railway.app';

// RUNTIME API URL - bypasses Next.js build-time env var issues
// This function is called at runtime, not build time
export const getApiBaseUrl = (): string => {
  // Priority 1: Environment variable (set in Railway deployment)
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    // Ensure HTTPS for railway.app domains
    const apiUrl = envUrl.includes('railway.app') && envUrl.startsWith('http://')
      ? envUrl.replace(/^http:/, 'https:')
      : envUrl;

    // Debug logging in development
    if (typeof window !== 'undefined' && !envUrl.includes('railway.app')) {
      console.log('[API Config] Using env var API URL:', apiUrl);
    }

    return apiUrl;
  }

  // Priority 2: Client-side runtime detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      console.log('[API Config] Using localhost API URL');
      return 'http://localhost:8000/api/v1';
    }

    // Railway deployment - use hardcoded URL
    if (hostname.includes('railway.app')) {
      const apiUrl = 'https://tms-server-staging.up.railway.app/api/v1';
      console.log('[API Config] Using Railway API URL:', apiUrl);
      return apiUrl;
    }

    // Custom domain fallback
    console.warn('[API Config] Unknown hostname, using default staging API URL:', hostname);
    return 'https://tms-server-staging.up.railway.app/api/v1';
  }

  // Priority 3: SSR fallback - assume production Railway deployment
  return 'https://tms-server-staging.up.railway.app/api/v1';
};

/**
 * Get WebSocket URL based on runtime environment
 * Critical: Returns BASE URL only - Socket.IO client will append path
 */
const getWsUrl = () => {
  // Client-side: detect from window.location
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Railway deployment (production/staging)
    if (hostname.includes('railway.app')) {
      return 'wss://tms-server-staging.up.railway.app';
    }

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'ws://localhost:8000';
    }
  }

  // Server-side or fallback: try environment variable
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl) {
    // Force WSS if the URL contains 'railway.app' (production/staging)
    if (envUrl.includes('railway.app') && envUrl.startsWith('ws://')) {
      return envUrl.replace('ws://', 'wss://');
    }
    return envUrl;
  }

  // Final fallback for SSR
  return 'ws://localhost:8000';
};

export const WS_URL = getWsUrl();

// Environment
export const IS_DEVELOPMENT = process.env.NEXT_PUBLIC_ENVIRONMENT === 'development';
export const IS_PRODUCTION = process.env.NEXT_PUBLIC_ENVIRONMENT === 'production';

// Cloudinary Configuration
export const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
export const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '';

// Message Configuration
export const MAX_MESSAGE_LENGTH = 10000;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Pagination
export const MESSAGES_PER_PAGE = 50;
export const CONVERSATIONS_PER_PAGE = 20;

// WebSocket Events
export const WS_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',

  // Messages
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Presence
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',

  // Calls
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPTED: 'call:accepted',
  CALL_DECLINED: 'call:declined',
  CALL_ENDED: 'call:ended',
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  THEME: 'theme',
  LANGUAGE: 'language',
} as const;

// UI Configuration
export const SIDEBAR_WIDTH = 320; // Desktop sidebar width in pixels
export const HEADER_HEIGHT = 60; // Header height in pixels
export const BOTTOM_NAV_HEIGHT = 56; // Mobile bottom nav height in pixels
export const MESSAGE_INPUT_HEIGHT = 70; // Message input height in pixels

// Animation Durations (ms)
export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 200,
  SLOW: 300,
} as const;

// Debounce/Throttle Delays (ms)
export const DEBOUNCE_DELAY = 300;
export const TYPING_INDICATOR_DELAY = 1000;
export const SEARCH_DEBOUNCE_DELAY = 500;

// Cache Configuration
export const CACHE_TTL = {
  USER_DATA: 5 * 60 * 1000, // 5 minutes
  CONVERSATION_LIST: 2 * 60 * 1000, // 2 minutes
  MESSAGE_CACHE: 10 * 60 * 1000, // 10 minutes
} as const;
