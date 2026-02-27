const CACHE_NAME = 'fala-lindona-v2'

const PRECACHE = [
  '/',
  '/bg.jpg',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return

  e.respondWith(
    caches.match(e.request).then((cached) => {
      // imagens: cache first, não busca na rede se já tem
      if (cached && e.request.destination === 'image') {
        return cached
      }

      // resto: stale-while-revalidate
      const fetched = fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone))
        }
        return response
      }).catch(() => cached)

      return cached || fetched
    })
  )
})
