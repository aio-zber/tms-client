/**
 * Centralized logging utility for TMS Client
 *
 * Features:
 * - Environment-aware (development vs production)
 * - Category-based control (auth, websocket, api, message, etc.)
 * - Runtime configuration via localStorage
 * - Zero overhead in production (tree-shakeable)
 *
 * Usage:
 * ```typescript
 * import { log } from '@/lib/logger';
 *
 * log.auth.info('User authenticated');
 * log.ws.error('Connection failed:', error);
 * log.message.debug('Message sent:', messageId);
 * ```
 */

export type LogCategory =
  | 'auth'          // Authentication & security (always enabled)
  | 'websocket'     // WebSocket events
  | 'api'           // HTTP requests
  | 'message'       // Message operations
  | 'visibility'    // Read/unread tracking
  | 'query'         // TanStack Query
  | 'notification'  // Notifications
  | 'encryption'    // E2EE encryption operations
  | 'general';      // Uncategorized

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  categories: Record<LogCategory, boolean>;
}

class Logger {
  private config: LoggerConfig;
  private timers: Map<string, number> = new Map();

  constructor() {
    const isDev = process.env.NODE_ENV === 'development';
    const forceDebug = process.env.NEXT_PUBLIC_FORCE_DEBUG === 'true';

    this.config = {
      enabled: isDev || forceDebug,
      categories: {
        auth: true,           // Always enabled (security)
        websocket: isDev || forceDebug,
        api: isDev || forceDebug,
        message: isDev || forceDebug,
        visibility: isDev || forceDebug,
        query: isDev || forceDebug,
        notification: isDev || forceDebug,
        encryption: isDev || forceDebug,
        general: isDev || forceDebug,
      },
    };

    // Check localStorage for runtime overrides (browser only)
    if (typeof window !== 'undefined') {
      this.loadLocalStorageConfig();
    }
  }

  /**
   * Load debug configuration from localStorage
   * Format: localStorage.debug = 'websocket,message,api'
   */
  private loadLocalStorageConfig(): void {
    try {
      const debugConfig = localStorage.getItem('debug');
      if (debugConfig) {
        const categories = debugConfig.split(',').map(c => c.trim()) as LogCategory[];
        categories.forEach(category => {
          if (category in this.config.categories) {
            this.config.categories[category] = true;
          }
        });
      }
    } catch (error) {
      // Ignore localStorage errors (SSR, private browsing, etc.)
    }
  }

  /**
   * Check if logging should happen for a given category and level
   */
  private shouldLog(category: LogCategory, level: LogLevel): boolean {
    // Always log errors
    if (level === 'error') return true;

    // Always log auth category (security)
    if (category === 'auth') return true;

    // Check if category is enabled
    return this.config.enabled && this.config.categories[category];
  }

  /**
   * Format the log message with category prefix
   */
  private format(category: LogCategory, message: string): string {
    return `[${category.toUpperCase()}] ${message}`;
  }

  /**
   * Log a debug message
   */
  debug(category: LogCategory, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(category, 'debug')) return;
    console.log(this.format(category, message), ...args);
  }

  /**
   * Log an info message
   */
  info(category: LogCategory, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(category, 'info')) return;
    console.log(this.format(category, message), ...args);
  }

  /**
   * Log a warning message
   */
  warn(category: LogCategory, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(category, 'warn')) return;
    console.warn(this.format(category, message), ...args);
  }

  /**
   * Log an error message (always logged)
   */
  error(category: LogCategory, message: string, ...args: unknown[]): void {
    console.error(this.format(category, message), ...args);
  }

  /**
   * Start a timer for performance measurement
   */
  time(category: LogCategory, label: string): void {
    if (!this.shouldLog(category, 'debug')) return;
    const key = `${category}:${label}`;
    this.timers.set(key, Date.now());
  }

  /**
   * End a timer and log the elapsed time
   */
  timeEnd(category: LogCategory, label: string): void {
    if (!this.shouldLog(category, 'debug')) return;
    const key = `${category}:${label}`;
    const startTime = this.timers.get(key);

    if (startTime) {
      const elapsed = Date.now() - startTime;
      console.log(this.format(category, `${label}: ${elapsed}ms`));
      this.timers.delete(key);
    }
  }

  /**
   * Start a collapsible group
   */
  group(category: LogCategory, label: string): void {
    if (!this.shouldLog(category, 'debug')) return;
    console.group(this.format(category, label));
  }

  /**
   * End a collapsible group
   */
  groupEnd(): void {
    console.groupEnd();
  }

  /**
   * Runtime configuration: Enable/disable a category
   */
  setCategory(category: LogCategory, enabled: boolean): void {
    this.config.categories[category] = enabled;

    // Persist to localStorage
    if (typeof window !== 'undefined') {
      try {
        const enabledCategories = Object.entries(this.config.categories)
          .filter(([_, isEnabled]) => isEnabled)
          .map(([cat]) => cat)
          .join(',');
        localStorage.setItem('debug', enabledCategories);
      } catch (error) {
        // Ignore localStorage errors
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<LoggerConfig> {
    return Object.freeze({ ...this.config });
  }
}

// Create singleton instance
const logger = new Logger();

// Export convenience methods for each category
export const log = {
  // Auth logging (always enabled)
  auth: {
    debug: (msg: string, ...args: unknown[]) => logger.debug('auth', msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info('auth', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn('auth', msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error('auth', msg, ...args),
  },

  // WebSocket logging
  ws: {
    debug: (msg: string, ...args: unknown[]) => logger.debug('websocket', msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info('websocket', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn('websocket', msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error('websocket', msg, ...args),
  },

  // API logging
  api: {
    debug: (msg: string, ...args: unknown[]) => logger.debug('api', msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info('api', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn('api', msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error('api', msg, ...args),
  },

  // Message logging
  message: {
    debug: (msg: string, ...args: unknown[]) => logger.debug('message', msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info('message', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn('message', msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error('message', msg, ...args),
    time: (label: string) => logger.time('message', label),
    timeEnd: (label: string) => logger.timeEnd('message', label),
    group: (label: string) => logger.group('message', label),
    groupEnd: () => logger.groupEnd(),
  },

  // Visibility tracking
  visibility: {
    debug: (msg: string, ...args: unknown[]) => logger.debug('visibility', msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info('visibility', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn('visibility', msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error('visibility', msg, ...args),
  },

  // TanStack Query logging
  query: {
    debug: (msg: string, ...args: unknown[]) => logger.debug('query', msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info('query', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn('query', msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error('query', msg, ...args),
  },

  // Notification logging
  notification: {
    debug: (msg: string, ...args: unknown[]) => logger.debug('notification', msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info('notification', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn('notification', msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error('notification', msg, ...args),
  },

  // Encryption logging (E2EE operations)
  encryption: {
    debug: (msg: string, ...args: unknown[]) => logger.debug('encryption', msg, ...args),
    info: (msg: string, ...args: unknown[]) => logger.info('encryption', msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn('encryption', msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error('encryption', msg, ...args),
  },

  // General logging (fallback)
  debug: (msg: string, ...args: unknown[]) => logger.debug('general', msg, ...args),
  info: (msg: string, ...args: unknown[]) => logger.info('general', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => logger.warn('general', msg, ...args),
  error: (msg: string, ...args: unknown[]) => logger.error('general', msg, ...args),
};

// Export logger instance for advanced usage
export { logger };
