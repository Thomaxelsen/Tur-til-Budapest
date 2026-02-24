const CACHE_NAME = 'turplan-v8';
const STATIC_ASSETS = [
  'index.html',
  'css/style.css',
  'js/firebase-config.js',
  'js/firestore-service.js',
  'js/places-search.js',
  'js/app.js',
  'manifest.json'
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
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  const requestUrl = new URL(url);

  // Only handle http(s)
  if (!requestUrl.protocol.startsWith('http')) return;

  // Network-first for API calls and Firebase
  if (url.includes('firestore.googleapis.com') ||
      url.includes('nominatim.openstreetmap.org') ||
      url.includes('api.geoapify.com') ||
      url.includes('gstatic.com/firebasejs')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for app shell files to avoid HTML/CSS/JS version mismatch after deploy
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const path = requestUrl.pathname;
  const isAppShellAsset = isSameOrigin && (
    path.endsWith('/index.html') ||
    path.endsWith('/sw.js') ||
    path.includes('/css/') ||
    path.includes('/js/') ||
    path.endsWith('/manifest.json')
  );

  if (isAppShellAsset) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
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
