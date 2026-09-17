'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the browser currently thinks it has a connection.
 *
 * Starts `true` — `navigator` doesn't exist during SSR, and assuming online
 * means the offline notice appears once we know rather than flashing on every
 * first paint. `navigator.onLine` only reports whether there's *a* network, not
 * whether it reaches anything, so treat it as a hint for what to tell the user,
 * never as a gate on attempting a request.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
