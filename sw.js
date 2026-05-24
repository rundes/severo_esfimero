const CACHE = 'severo-v1';
const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/gcs.js',
  './js/questions.js',
  './js/geo.js',
  './js/sheets.js',
  './js/barrios.js',
  './js/auth.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Solo cachear assets propios; dejar pasar Google Sheets / GCS
  if (!url.hostname.includes('github') && url.hostname !== location.hostname) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
