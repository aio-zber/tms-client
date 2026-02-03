/**
 * Service Worker Registration and Management
 *
 * Handles registration, updates, and lifecycle of the service worker
 *
 * Features:
 * - Auto-registration on app load
 * - Update detection and notification
 * - Graceful fallback if service worker not supported
 * - Version management
 *
 * Pattern: Based on next-pwa and web-push best practices
 * Reference: /shadowwalker/next-pwa, /web-push-libs/web-push
 */

import { log } from './logger';

/**
 * Check if service workers are supported in current browser
 */
export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Register the service worker
 *
 * Should be called once on app initialization
 * Handles registration, updates, and errors gracefully
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  // Check if service workers are supported
  if (!isServiceWorkerSupported()) {
    log.notification.warn('Service Workers not supported in this browser');
    return null;
  }

  // Only register in production or when explicitly enabled in development
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_ENABLE_SW) {
    log.notification.info('Service Worker disabled in development');
    return null;
  }

  try {
    log.notification.info('Registering Service Worker...');

    // Register the service worker
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    log.notification.info('Service Worker registered successfully', registration);

    // Check for updates
    setupUpdateListener(registration);

    // Request notification permission if not already granted
    if ('Notification' in window && Notification.permission === 'default') {
      log.notification.info('Notification permission not yet requested');
    }

    return registration;
  } catch (error) {
    log.notification.error('Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Setup listener for service worker updates
 *
 * Notifies user when a new version is available
 */
function setupUpdateListener(registration: ServiceWorkerRegistration): void {
  // Listen for updates
  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;

    if (!installingWorker) return;

    log.notification.info('New Service Worker version found, installing...');

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          // New service worker available, show update notification
          log.notification.info('New version available! Refresh to update.');

          // Optional: Notify user about update
          // You could show a toast notification here
          // toast.info('A new version is available. Refresh to update.');

          // Optional: Auto-reload after user confirmation
          // if (confirm('A new version is available. Reload to update?')) {
          //   window.location.reload();
          // }
        } else {
          // First installation
          log.notification.info('Service Worker installed for the first time');
        }
      }
    });
  });

  // Check for updates periodically (every hour)
  setInterval(() => {
    log.notification.debug('Checking for Service Worker updates...');
    registration.update().catch((error) => {
      log.notification.error('Failed to check for updates:', error);
    });
  }, 60 * 60 * 1000); // 1 hour
}

/**
 * Unregister the service worker
 *
 * Useful for development or debugging
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const success = await registration.unregister();

    if (success) {
      log.notification.info('Service Worker unregistered successfully');
    } else {
      log.notification.warn('Service Worker unregister failed');
    }

    return success;
  } catch (error) {
    log.notification.error('Error unregistering Service Worker:', error);
    return false;
  }
}

/**
 * Get the current service worker registration
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.ready;
  } catch (error) {
    log.notification.error('Error getting Service Worker registration:', error);
    return null;
  }
}

/**
 * Send a message to the service worker
 *
 * Useful for two-way communication
 */
export async function sendMessageToServiceWorker(message: {
  type: string;
  payload?: unknown;
}): Promise<unknown> {
  if (!isServiceWorkerSupported()) {
    throw new Error('Service Workers not supported');
  }

  const registration = await navigator.serviceWorker.ready;

  if (!registration.active) {
    throw new Error('No active Service Worker');
  }

  return new Promise((resolve, reject) => {
    if (!registration.active) {
      reject(new Error('No active Service Worker'));
      return;
    }

    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      if (event.data.error) {
        reject(event.data.error);
      } else {
        resolve(event.data);
      }
    };

    registration.active.postMessage(message, [messageChannel.port2]);
  });
}

/**
 * Get the service worker version
 */
export async function getServiceWorkerVersion(): Promise<string | null> {
  try {
    const response = await sendMessageToServiceWorker({ type: 'GET_VERSION' });
    return (response as { version: string }).version || null;
  } catch (error) {
    log.notification.error('Failed to get Service Worker version:', error);
    return null;
  }
}

/**
 * Force service worker to skip waiting and activate
 *
 * Use with caution - will reload all clients
 */
export async function skipWaitingAndActivate(): Promise<void> {
  if (!isServiceWorkerSupported()) {
    return;
  }

  try {
    await sendMessageToServiceWorker({ type: 'SKIP_WAITING' });
    log.notification.info('Service Worker activated immediately');

    // Reload the page to get the new version
    window.location.reload();
  } catch (error) {
    log.notification.error('Failed to activate Service Worker:', error);
  }
}
