'use client';

import { useEffect } from 'react';

/**
 * Registers `public/sw.js`, which caches the app shell so Lexis opens without
 * waiting for (or having) a connection. Renders nothing.
 *
 * `updateViaCache: 'none'` keeps the browser from serving the worker itself out
 * of the HTTP cache, so a changed `sw.js` is picked up on the next visit.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // The dev server rebuilds assets on every edit, which a cache-first worker
    // would happily serve back stale.
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          // Private windows and some enterprise policies refuse registration.
          // Nothing to do: the app just works online-only.
        });
    };

    // Registering after load keeps the worker's install off the critical path
    // of the first render.
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
