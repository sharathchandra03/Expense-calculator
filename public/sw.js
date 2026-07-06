// Self-destroying service worker to rescue the browser from development caching loops
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => {
          if (client.navigate) {
            client.navigate(client.url);
          }
        });
      })
  );
});
