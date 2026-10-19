// PennyFlow Service Worker v3 — Production-safe
// This SW provides offline support without interfering with user data.
// IndexedDB and localStorage are NEVER touched by the service worker.

const CACHE_NAME = 'pennyflow-app-v4';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Install: cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-critical: if caching fails, app still works via network
      });
    })
  );
  // Activate immediately without waiting for old SW to stop
  self.skipWaiting();
});

// Allow the page to tell a waiting worker to activate right away.
// The client posts { type: 'SKIP_WAITING' } when it detects an update.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate: clean up old cache versions only
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // Only delete OLD caches
          .map((key) => caches.delete(key))
      );
    }).then(() => {
      // Take control of all open tabs
      return self.clients.claim();
    })
  );
});

// Fetch: Network-first strategy (always try network, fall back to cache)
// This ensures users always get the latest version after a deploy
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API/supabase requests — never cache those
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase') || url.hostname.includes('google')) return;

  // HTML navigations: always go to the network and DON'T cache the document.
  // Caching the HTML is what makes a tab serve stale markup that points at
  // old, deleted /_next/ asset chunks after a deploy. Fall back to a cached
  // shell only when the network is unavailable (offline support).
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
        // Clone and cache successful responses for offline use
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache if available
        return caches.match(event.request).then((cached) => {
          return cached || new Response('Offline', { status: 503 });
        });
      })
  );
});
