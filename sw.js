/* ============================================================
   Service Worker — Mes Dîners du Soir
   Stratégie : Cache-first pour les assets statiques
               Network-first pour recettes.json
   ============================================================ */

const CACHE_NAME   = 'mes-diners-v2';
const STATIC_CACHE = 'mes-diners-static-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,500;1,400&display=swap',
];

/* ─── Installation ─── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Les fonts peuvent échouer en offline, on continue quand même
      });
    }).then(() => self.skipWaiting())
  );
});

/* ─── Activation & nettoyage des anciens caches ─── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ─── Interception des requêtes ─── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // recettes.json : Network-first (mise à jour du catalogue)
  if (url.pathname.endsWith('/recettes.json')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets statiques (HTML, fonts, manifest) : Cache-first
  if (
    event.request.method === 'GET' &&
    (url.pathname === '/' ||
     url.pathname.endsWith('.html') ||
     url.pathname.endsWith('.json') ||
     url.pathname.endsWith('.js') ||
     url.hostname.includes('fonts.g') ||
     url.hostname.includes('plausible'))
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(res => {
          if (res.ok) {
            caches.open(STATIC_CACHE).then(c => c.put(event.request, res.clone()));
          }
          return res;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Firebase & autres : passe-plat
});
