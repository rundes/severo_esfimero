const CACHE = 'severo-v2.9.1';
const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // Cachea assets y queda en estado "waiting" — NO llama skipWaiting()
  // para que el update modal controle cuándo activar.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Solo gestionar assets del propio dominio
  if (url.hostname !== location.hostname) return;

  const path = url.pathname;
  // Network-first para HTML, JS y version.json: garantiza que los deploys
  // se sirven frescos. cache: 'no-cache' fuerza revalidación con el origen
  // y evita que el HTTP cache del browser sirva JS stale después de un
  // deploy (los `?_v=` del index.html + esto = sin chance de stale).
  if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('/') || path.endsWith('version.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      }).catch(() =>
        // Fallback offline: si el cache no tiene la URL exacta (típico
        // tras un deploy nuevo, donde js/app.js?_v=2.9.0 no está pero
        // js/app.js sí — quedó cacheado por el SW anterior), intentar
        // match por pathname pelado. Sin esto, un device sin red con
        // SW viejo se quedaba colgado en el splash.
        caches.match(e.request).then((r) => r || caches.match(path))
      )
    );
    return;
  }

  // Cache-first para CSS, imágenes e iconos
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, clone));
      return res;
    }))
  );
});
