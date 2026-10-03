const CACHE_NAME = 'carnet-analyse-v217';
// Version affichee aux utilisateurs (doit etre egale a APP_VERSION de index.html) : 1.0, puis 1.1 pour de nouvelles fonctionnalites, 1.0.1 pour des corrections.
const APP_VERSION = '1.0';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png?v=3',
  './icon-512.png?v=2',
  './logo-full.png'
];
// Seules les polices Google sont mises en cache hors du site. Les appels de recherche de logos
// (Wikidata, Wikimedia, Google favicon, Clearbit) passent directement par le navigateur, sans être conservés.
const CACHEABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin && !CACHEABLE_HOSTS.includes(url.hostname)) return;
  if (event.request.method !== 'GET') return;
  // La PAGE (index.html) est demandée au réseau d'abord (2026-10-04) : avant, elle était servie depuis le cache et ne se renouvelait qu'au
  // chargement suivant, donc une personne pouvait rester sur une ancienne version sans le savoir. `no-cache` = le navigateur revalide auprès
  // du serveur (réponse 304 légère si rien n'a changé). Hors connexion, on retombe sur la copie en cache.
  const isPage = event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  if (isPage && url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match(event.request)))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
