// PennyFlow Service Worker v3 — Production-safe
// This SW provides offline support without interfering with user data.
// IndexedDB and localStorage are NEVER touched by the service worker.

const CACHE_NAME = 'pennyflow-app-v3';
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
