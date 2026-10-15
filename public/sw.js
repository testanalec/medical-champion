// Service worker: offline shell for the Companion PWA (network-first for API, cache-first for assets).
const CACHE = 'mc-mv9sfyfx';
const SHELL = ['/', '/index.html', '/app.html', '/assets/app.js?v=mv9sfyfx', '/assets/app.css?v=mv9sfyfx', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    // Offline: the Ops portal and Champ app open from the app shell, everything else from the home page
    const shell = /^\/(ops|companion|track|pay)(\/|$)/.test(url.pathname) ? '/app.html' : '/index.html';
    e.respondWith(fetch(e.request).catch(() => caches.match(shell)));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  })));
});
