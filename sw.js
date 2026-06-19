const CACHE_NAME = 'calcgrade-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icon.png'
];

// 1. INSTALACIÓN A PRUEBA DE FALLOS
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Guardamos uno por uno. Si un archivo falta, no destruye toda la app.
      for (let asset of ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('Advertencia: No se pudo cachear ->', asset);
        }
      }
    })
  );
  self.skipWaiting();
});

// 2. ACTIVACIÓN Y LIMPIEZA DE VERSIONES ANTERIORES
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// 3. INTERCEPTOR (ESTRATEGIA: "Red primero, Caché como respaldo")
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Si hay internet, guardamos una copia fresca en el caché en secreto
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => {
        // Si falló (Modo Avión), sacamos la copia de emergencia del caché
        return caches.match(e.request).then((cachedRes) => {
          return cachedRes || caches.match('/'); // Si no encuentra la ruta exacta, manda al inicio
        });
      })
  );
});
