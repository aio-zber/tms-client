/**
 * Application Constants
 * Centralized configuration values used throughout the application
 */

import { getApiUrl, getWebSocketUrl } from './runtimeConfig';

/**
 * Get API base URL using runtime detection
 * This avoids Next.js build-time environment variable replacement issues
 *
 * IMPORTANT: This always points to TMS Server, NOT GCGC directly!
 * All browser requests must route through TMS Server to avoid CORS issues.
 */
export const getApiBaseUrl = getApiUrl;

/**
 * GCGC Team Management System URL for static file access
 * Used ONLY for accessing uploaded files (profile images, attachments, etc.)
 *
 * DO NOT use this for API calls! Use getApiBaseUrl() instead.
 */
export const GCGC_FILE_URL = process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_API_URL || '';

/**
 * Get WebSocket URL using runtime detection
 * Critical: Returns BASE URL only - Socket.IO client will append path
 */
export const WS_URL = getWebSocketUrl();

// Environment
export const IS_DEVELOPMENT = process.env.NEXT_PUBLIC_ENVIRONMENT === 'development';
export const IS_PRODUCTION = process.env.NEXT_PUBLIC_ENVIRONMENT === 'production';

// Cloudinary Configuration
export const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
export const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '';

// Message Configuration
export const MAX_MESSAGE_LENGTH = 10000;
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
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
