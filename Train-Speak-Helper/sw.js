// Minimal Service Worker for Train-Speak Helper
const CACHE_NAME = 'train-speak-v1';
const ASSETS = ['./', './index.html', './styles.css', './script.js'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('cdn') || e.request.url.includes('unpkg')) return;
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    ));
});