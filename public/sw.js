/**
 * Service Worker for GCG Team Messaging App
 *
 * Features:
 * - Handles notification click events
 * - Smart window focus behavior (focus existing tab if open, else open new tab)
 * - Handles notification close events
 * - Future: Background sync, offline support
 *
 * Pattern: Based on Web Push Protocol best practices
 * Reference: web-push-libs/web-push documentation
 */

// Service Worker version - increment to force update
const SW_VERSION = '1.0.0';

console.log(`[Service Worker ${SW_VERSION}] Loading...`);

/**
 * Notification Click Handler
 *
 * Smart behavior:
 * 1. If app is already open in a tab, focus that tab
 * 2. If app is not open, open a new tab
 * 3. Navigate to the conversation if conversationId is provided
 *
 * Pattern: From /web-push-libs/web-push best practices
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click event:', event);

  // Close the notification
  event.notification.close();

  // Extract data from notification
  const notificationData = event.notification.data || {};
  const conversationId = notificationData.conversationId;
  const messageId = notificationData.messageId;

  // Construct target URL
  let targetUrl = '/';
  if (conversationId) {
    targetUrl = `/chats/${conversationId}`;
    if (messageId) {
      targetUrl += `?messageId=${messageId}`;
    }
  }

  // Full URL (will work for both localhost and production)
  const urlToOpen = new URL(targetUrl, self.location.origin).href;

  console.log('[Service Worker] Target URL:', urlToOpen);

  // Smart window focus behavior
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      console.log('[Service Worker] Found clients:', clientList.length);

      // Check if the app is already open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        console.log('[Service Worker] Checking client:', client.url);

        // Check if the client is on our domain
        if (client.url.indexOf(self.location.origin) === 0) {
          console.log('[Service Worker] Found existing window, focusing and navigating');

          // Focus the existing window and navigate to target URL
          return client.focus().then(() => {
            // Navigate to the conversation
            if (conversationId) {
              return client.navigate(urlToOpen);
            }
            return client;
          });
        }
      }

      // If no window is open, open a new one
      console.log('[Service Worker] No existing window found, opening new window');
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    }).catch((error) => {
      console.error('[Service Worker] Error handling notification click:', error);
    })
  );
});

/**
 * Notification Close Handler
 *
 * Track when users dismiss notifications without clicking
 * Useful for analytics
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification closed:', event.notification.tag);

  // Optional: Send analytics event to server
  // This could be used to track notification effectiveness
  const notificationData = event.notification.data || {};

  // Future: Log dismissal to analytics
  // fetch('/api/v1/analytics/notification-dismissed', {
  //   method: 'POST',
  //   body: JSON.stringify({
  //     notificationId: notificationData.notificationId,
  //     timestamp: Date.now()
  //   })
  // });
});

/**
 * Push Event Handler
 *
 * Receives push messages from the server and displays notifications
 * Currently handled by browserNotificationService.ts on the client
 * This is here for future server-push support
 */
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push event received');

  if (!event.data) {
    console.log('[Service Worker] Push event has no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('[Service Worker] Push data:', data);

    const title = data.title || 'New Message';
    const options = {
      body: data.body || 'You have a new notification',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: data.badge || '/icons/badge-72x72.png',
      tag: data.tag || `notification-${Date.now()}`,
      data: {
        conversationId: data.conversationId,
        messageId: data.messageId,
        notificationId: data.notificationId,
        url: data.url || '/'
      },
      requireInteraction: false,
      silent: false
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    console.error('[Service Worker] Error parsing push data:', error);
  }
});

/**
 * Install Event
 *
 * Triggered when the service worker is first installed
 */
self.addEventListener('install', (event) => {
  console.log(`[Service Worker ${SW_VERSION}] Installing...`);

  // Skip waiting to activate immediately
  self.skipWaiting();
});

/**
 * Activate Event
 *
 * Triggered when the service worker is activated
 * Good place to clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log(`[Service Worker ${SW_VERSION}] Activating...`);

  // Claim all clients immediately
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log(`[Service Worker ${SW_VERSION}] Claimed all clients`);
    })
  );
});

/**
 * Message Event
 *
 * Handles messages from the client application
 * Useful for two-way communication
 */
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received from client:', event.data);

  // Handle different message types
  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;

      case 'GET_VERSION':
        event.ports[0].postMessage({ version: SW_VERSION });
        break;

      default:
        console.log('[Service Worker] Unknown message type:', event.data.type);
    }
  }
});

console.log(`[Service Worker ${SW_VERSION}] Loaded successfully`);
