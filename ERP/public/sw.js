const CACHE_VERSION = 'pnzj-erp-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('pnzj-erp-') && !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin && /\.(?:js|css|woff2?|png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  }
});
