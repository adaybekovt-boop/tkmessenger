/**
 * Service Worker: Offline App Shell Caching ONLY.
 * WebRTC logic must stay strictly out of here.
 */

const CACHE_NAME = 'orbits-pwa-v1';

// We only cache the bare minimum static assets for the App Shell.
const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'src/styles/style.css',
  // You can add compiled assets here if needed.
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force SW to take control immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching App Shell');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for our origin. Ignore WebRTC/Signaling/API traffic.
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response; // Return cached App Shell
      }
      
      // Fallback to network
      return fetch(event.request).then((networkResponse) => {
        // Optionally cache new dynamic static files here if desired.
        // For strict offline-first stability, we just return the network response.
        return networkResponse;
      }).catch((error) => {
        console.error('[SW] Network fetch failed:', error);
        // If everything fails and it's a navigation request, we could return a fallback HTML here.
        if (event.request.mode === 'navigate') {
           return caches.match('index.html');
        }
      });
    })
  );
});