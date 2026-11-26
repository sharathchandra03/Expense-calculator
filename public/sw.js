// PennyFlow Service Worker v5 — Production-safe, no mid-session reloads
// IndexedDB and localStorage are NEVER touched by the service worker.

const CACHE_NAME = 'pennyflow-app-v5';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Install: cache static shell.
// IMPORTANT: do NOT call skipWaiting() here unconditionally.
// Calling it on every install means the SW activates mid-session on the very
// first load (no previous controller exists) which triggers controllerchange
// on the page and causes the app to reload itself unprompted.
// We ONLY skip waiting when the page explicitly asks us to — that happens only
// when a new SW is waiting AND an old controller was already running (genuine
// update, not first install).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-critical: if caching fails, app still works via network.
      });
    })
  );
  // *** Do NOT call self.skipWaiting() here ***
});

// The page posts { type: 'SKIP_WAITING' } only when it detects a waiting
// worker AND a controller was already active (see page.tsx). This is the only
// path that activates a new SW mid-session, ensuring the reload toast is shown.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate: clean up old cache versions and take control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch: Network-first strategy (always try network, fall back to cache).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase') || url.hostname.includes('google')) return;

  // HTML navigations: network-only, no caching.
  // Caching the HTML document causes stale markup pointing at deleted /_next/
  // asset chunks after a deploy, which produces blank screens offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('/'))
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || new Response('Offline', { status: 503 });
        });
      })
  );
});
