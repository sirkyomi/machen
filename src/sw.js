const CACHE = 'machen-pwa-v4';
const ASSETS = ['./', './index.html', './style.css', './manifest.webmanifest', './machen-mark.svg', './icons.js', './i18n.js', './language.js', './links.js', './forms.js', './filters.js', './controls.js', './web-api.js', './updates.js', './app.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))); });
