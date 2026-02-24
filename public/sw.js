const CACHE_NAME = 'turplan-v1';
const STATIC_ASSETS = [
  '/index.html',
  '/css/style.css',
  '/js/firebase-config.js',
  '/js/firestore-service.js',
  '/js/places-search.js',
  '/js/app.js',
  '/manifest.json'
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Network-first for API calls and Firebase
  if (url.includes('firestore.googleapis.com') ||
      url.includes('nominatim.openstreetmap.org') ||
      url.includes('gstatic.com/firebasejs')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
