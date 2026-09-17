/* Lexis service worker — the app shell, offline and instant.
 *
 * Next.js documents Serwist for offline support, but Serwist needs a webpack
 * config and this project is Turbopack-only (see CLAUDE.md), so the worker is
 * written out by hand. It is small enough to read in one sitting.
 *
 * Strategy, by request kind:
 *
 *   navigations      cache-first, revalidated in the background. The point is
 *                    that opening the app never waits on the network; a deploy
 *                    is picked up on the launch after it lands.
 *   /_next/static/*  cache-first, forever. Those URLs are content-hashed, so a
 *                    changed file is a different URL and can never go stale.
 *   other same-origin
 *                    stale-while-revalidate (icons, the pdf.js worker, …).
 *   RSC payloads     not intercepted — Next's router has its own fallback, and
 *                    replaying a stale payload would desync the route tree.
 *   cross-origin     not intercepted. Firebase Auth/Firestore/Storage and the
 *                    Kokoro model download must always talk to the network, and
 *                    Firestore keeps its own IndexedDB cache for offline reads.
 *
 * Bump VERSION to throw away every cache on the next activation.
 */

const VERSION = 'v1';
const PAGES = `lexis-pages-${VERSION}`;
const ASSETS = `lexis-assets-${VERSION}`;
const CURRENT = [PAGES, ASSETS];

// Prerendered routes worth having before the user first goes offline. The
// reader route is dynamic (one entry per book), so it is cached as it's visited.
const SHELL = ['/library', '/', '/upload', '/offline'];

const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      // Individually, so one failure can't abort the whole install.
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('lexis-') && !CURRENT.includes(key)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Lets the page ask a waiting worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Firebase, Hugging Face, anything else off-origin: straight to the network.
  if (url.origin !== self.location.origin) return;
  // Translation API — never serve a stale answer.
  if (url.pathname.startsWith('/api/')) return;
  // React Server Component payloads. Next falls back to a full navigation when
  // one fails, and that navigation is something we *can* serve from cache.
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event, request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, request, ASSETS));
});

/**
 * Cache-first with background revalidation.
 *
 * The cached HTML keeps pointing at content-hashed chunks that are themselves
 * cached, so a shell one deploy behind still boots; the refetch below replaces
 * it for next time.
 */
async function handleNavigation(event, request) {
  const cache = await caches.open(PAGES);
  const cached = await cache.match(request, { ignoreSearch: true });

  if (cached) {
    event.waitUntil(revalidate(cache, request));
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(stripSearch(request), response.clone());
    return response;
  } catch {
    return offlineFallback();
  }
}

/**
 * What a navigation gets when it is neither cached nor reachable. Falls back to
 * a hand-written page rather than `Response.error()`, because the browser's own
 * network-error page tells the user nothing about which of their books are
 * still readable.
 */
async function offlineFallback() {
  const cached = (await caches.match(OFFLINE_URL)) ?? null;
  if (cached) return cached;
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
      '<body style="font:16px system-ui;padding:3rem;text-align:center">' +
      "<p>You're offline and this page isn't saved on this device.</p>" +
      '<p><a href="/library">Go to your library</a></p>',
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

async function revalidate(cache, request) {
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(stripSearch(request), response);
  } catch {
    // Offline — the copy already in the cache stays as it is.
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) ?? Response.error();
}

/** Cache navigations under their path alone, so `?foo=1` still hits offline.
 *  Returns a URL string — `cache.put` takes one, and a navigate-mode Request
 *  can't be reconstructed with the Request constructor. */
function stripSearch(request) {
  const url = new URL(request.url);
  url.search = '';
  return url.toString();
}
