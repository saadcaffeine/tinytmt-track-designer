/* Offline cache for TinyTMT track designer. Bump VERSION when files change. */
const VERSION = 'tinytmt-v1.3.0';
const FILES = [
  './', 'index.html', 'css/styles.css', 'icon.svg', 'manifest.webmanifest',
  'js/parts.js', 'js/names.js', 'js/geometry.js', 'js/marks.js', 'js/blueprint.js', 'js/samples.js', 'js/addons.js', 'js/app.js',
  'addons/view3d-placeholder.js'
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first so updates on GitHub Pages show up; cache fallback when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
