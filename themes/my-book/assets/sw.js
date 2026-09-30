const CACHE_VERSION = '{{ now.Unix }}';
const cacheName = `book-sw-cache-${CACHE_VERSION}`;
const fallbackPage = "{{ "/" | relURL }}";
const pages = [
{{ if eq .Site.Params.BookServiceWorker "precache" }}
  {{ range .Site.AllPages -}}
  "{{ .RelPermalink }}",
  {{ end -}}
{{ else }}
  fallbackPage,
{{ end }}
];

self.addEventListener('install', function (event) {
  self.skipWaiting();

  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(pages)).catch(() => {})
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== cacheName) return caches.delete(key);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  /**
   * @param {Response} response
   * @returns {Promise<Response>}
   */
  function saveToCache(response) {
    if (cacheable(response)) {
      return caches
        .open(cacheName)
        .then((cache) => cache.put(request, response.clone()))
        .then(() => response);
    } else {
      return response;
    }
  }

  /**
   * Always return a Response (never `undefined`).
   * @returns {Promise<Response>}
   */
  async function serveFromCache() {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const home = await cache.match(fallbackPage);
      if (home) return home;

      return new Response('当前处于离线状态，这个页面尚未缓存。联网后请重试。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      });
    }

    return new Response('', { status: 504 });
  }

  /**
   * @param {Response} response
   * @returns {Boolean}
   */
  function cacheable(response) {
    return (
      response.type === 'basic' &&
      response.ok &&
      !response.headers.has('Content-Disposition')
    );
  }

  event.respondWith(fetch(request).then(saveToCache).catch(serveFromCache));
});
