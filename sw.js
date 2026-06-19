const CACHE_NAME = 'calcgrade-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-ios.png'
];

// 1. Instalar el Service Worker y guardar la App en el caché del teléfono
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activar y limpiar versiones viejas de la app si las hubiera
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Interceptar peticiones: Si hay internet busca lo nuevo, si no, usa el caché
self.addEventListener('fetch', (e) => {
  // Solo interceptar archivos de nuestra propia app
  if (e.request.url.startsWith(self.location.origin)) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Devolvemos lo que está en caché, pero buscamos en la red de fondo por si cambió
          fetch(e.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
            }
          }).catch(() => {/* Silenciar errores de red offline */});
          
          return cachedResponse;
        }
        return fetch(e.request);
      })
    );
  }
});
