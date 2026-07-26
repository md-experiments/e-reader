'use client';

import { useEffect, useRef, useState } from 'react';

// Screen Wake Lock keeps the phone from dimming and locking while the reader is
// speaking. Typed locally rather than relying on lib.dom, whose WakeLock
// definitions vary between TypeScript versions.

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
};

export type WakeLockState =
  | 'unsupported' // no navigator.wakeLock (iOS < 16.4, older Android browsers)
  | 'idle' // not requested, or the system took it back while we were hidden
  | 'held' // screen is being kept awake
  | 'denied'; // the request failed — typically low battery or a policy block

/**
 * Hold a screen wake lock while `active` is true.
 *
 * The lock can only be held while the document is visible, and the browser
 * drops it as soon as the tab is hidden — so it is re-requested on every
 * visibilitychange back to visible (e.g. after the user unlocks the phone).
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>('idle');
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    const nav = typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithWakeLock);
    const wakeLock = nav?.wakeLock;
    if (!wakeLock) {
      // Deferred so the effect body doesn't setState synchronously
      const id = setTimeout(() => setState('unsupported'), 0);
      return () => clearTimeout(id);
    }

    let cancelled = false;

    const release = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };

    const acquire = async () => {
      if (cancelled || !active) return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      if (document.visibilityState !== 'visible') return;
      try {
        const sentinel = await wakeLock.request('screen');
        if (cancelled || !active) {
          void sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setState('held');
        // Fired when the system reclaims the lock (tab hidden, screen off by
        // other means). Re-acquired by the visibilitychange handler below.
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
          if (!cancelled) setState('idle');
        });
      } catch {
        if (!cancelled) setState('denied');
      }
    };

    if (!active) {
      release();
      const id = setTimeout(() => setState('idle'), 0);
      return () => {
        cancelled = true;
        clearTimeout(id);
      };
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, [active]);

  return state;
}
