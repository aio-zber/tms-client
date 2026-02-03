/**
 * WebSocket Keepalive Worker
 *
 * Uses an inline Web Worker to maintain periodic keepalive signals
 * even when the browser tab is in the background.
 *
 * Why: Browsers throttle setTimeout/setInterval to ~1 min in background tabs.
 * Web Workers run in a separate thread and are NOT throttled.
 * This prevents Socket.IO from timing out when the tab is inactive.
 *
 * Pattern: Messenger/Telegram keep connections alive in background tabs
 */

let worker: Worker | null = null;
let keepaliveCallback: (() => void) | null = null;

// Inline worker source - posts 'keepalive' message at fixed intervals
const WORKER_SOURCE = `
  let intervalId = null;

  self.onmessage = function(e) {
    if (e.data.type === 'start') {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(function() {
        self.postMessage({ type: 'keepalive' });
      }, e.data.interval || 30000);
    } else if (e.data.type === 'stop') {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  };
`;

/**
 * Start the keepalive worker
 * @param callback - Function to call on each keepalive tick
 * @param intervalMs - Interval in milliseconds (default: 30s)
 */
export function startKeepaliveWorker(callback: () => void, intervalMs: number = 30000): void {
  // Stop existing worker if any
  stopKeepaliveWorker();

  keepaliveCallback = callback;

  try {
    // Create inline worker from Blob
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    worker = new Worker(url);
    URL.revokeObjectURL(url); // Clean up blob URL after worker is created

    // Handle messages from worker
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'keepalive' && keepaliveCallback) {
        keepaliveCallback();
      }
    };

    // Start the interval
    worker.postMessage({ type: 'start', interval: intervalMs });
  } catch {
    // Web Workers not supported (e.g., some restricted environments)
    // Fall back to regular setInterval (will be throttled in background but better than nothing)
    const fallbackId = setInterval(() => {
      if (keepaliveCallback) keepaliveCallback();
    }, intervalMs);

    // Store cleanup reference
    worker = { terminate: () => clearInterval(fallbackId) } as unknown as Worker;
  }
}

/**
 * Stop the keepalive worker
 */
export function stopKeepaliveWorker(): void {
  if (worker) {
    try {
      worker.postMessage?.({ type: 'stop' });
    } catch {
      // Worker may already be terminated
    }
    worker.terminate();
    worker = null;
  }
  keepaliveCallback = null;
}
