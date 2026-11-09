/* CalmNotes service worker — makes the app open instantly and work offline.
   Bump VERSION whenever you change files, so visitors get the update. */
const VERSION = 'calmnotes-v1';
const SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/fonts/roboto-mono-latin.woff2',
  '/fonts/roboto-mono-latin-ext.woff2',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from cache straight away, refresh the cache in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? '/index.html' : req;
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(key);
      const fresh = fetch(req).then(res => {
        if (res.ok) cache.put(key, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
