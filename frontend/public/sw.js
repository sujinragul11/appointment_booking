/* Sloto service worker (PWA, FR-36).
 * - App shell cached on install; navigations are network-first with the cached shell offline.
 * - Hashed build assets (/assets/*) are cache-first.
 * - /api is network-first. Only anonymous GETs (providers, categories, ...) are kept for offline
 *   use; requests carrying a bearer token hold personal data and are never cached.
 * Bump VERSION to drop old caches after a breaking change.
 */
const VERSION = 'v1';
const SHELL_CACHE = `sloto-shell-${VERSION}`;
const ASSET_CACHE = `sloto-assets-${VERSION}`;
const API_CACHE = `sloto-api-${VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-maskable.svg'];
// Live data that would mislead when stale, or that must never be stored.
const NO_API_CACHE = /^\/api\/(auth|slots|payments|coupons|notifications)(\/|$)/;

self.addEventListener('install', (event) => {
  // One missing file (e.g. a server that doesn't expose /index.html) must not abort the install.
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, ASSET_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sloto-') && !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

async function navigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
    }
    return response;
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    const personal = request.headers.has('Authorization');
    if (personal || NO_API_CACHE.test(url.pathname)) return; // straight to the network
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
  }
});

// Server-sent Web Push (for when the backend supports it).
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Sloto', {
    body: payload.body || payload.message || '',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: payload.tag,
    data: { url: payload.url || '/notifications' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/notifications', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((c) => c.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(target).catch(() => {});
      return;
    }
    await self.clients.openWindow(target);
  })());
});
