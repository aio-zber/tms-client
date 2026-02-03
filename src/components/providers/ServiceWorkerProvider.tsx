/**
 * Service Worker Provider
 *
 * Registers the service worker on app initialization
 * Must be a client component to access browser APIs
 */

'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/serviceWorker';
import { log } from '@/lib/logger';

export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Register service worker on mount
    registerServiceWorker()
      .then((registration) => {
        if (registration) {
          log.notification.info('Service Worker registered in app');
        }
      })
      .catch((error) => {
        log.notification.error('Service Worker registration error:', error);
      });
  }, []);

  return <>{children}</>;
}
