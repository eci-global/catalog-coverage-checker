/* ---------------------------------------------------------------------------
   ECI EvolutionX Catalogue Coverage Check — service worker

   Bump VERSION on every deploy. The browser byte-compares this file, sees the
   change, installs the new worker, and the page offers the user a reload.
   --------------------------------------------------------------------------- */

const VERSION = '1.0.0';
const APP_CACHE = `evox-coverage-app-v${VERSION}`;
const RUNTIME_CACHE = `evox-coverage-runtime-v${VERSION}`;
const CURRENT = [APP_CACHE, RUNTIME_CACHE];

/* Everything the app needs to run with no network at all. The tool itself is a
   single self-contained HTML file, so this list stays short. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // cache: 'reload' bypasses the HTTP cache so a deploy never precaches a stale shell
    await Promise.all(PRECACHE.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
  })());
  // No skipWaiting here on purpose: swapping the app out from under someone
  // mid-analysis loses their work. The page asks first, then posts SKIP_WAITING.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => CURRENT.includes(n) ? null : caches.delete(n)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.disable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0] && event.ports[0].postMessage(VERSION);
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Page loads: serve the precached shell, so the app opens offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const shell = await caches.match('./index.html', { ignoreSearch: true });
      if (shell) return shell;
      try {
        return await fetch(req);
      } catch (e) {
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
          '<body style="font:15px system-ui;padding:40px">' +
          '<h1>You are offline</h1><p>Open the app once while connected and it will work offline after that.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // Our own files: cache first. They are versioned by the cache name above.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: false });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return caches.match('./index.html');
      }
    })());
    return;
  }

  // Anything else (the web font): use the cached copy, refresh it in the
  // background, and never let a failed request break the page.
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const hit = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await network) || Response.error();
  })());
});
