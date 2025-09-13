// Minimal Service Worker for Train-Speak Helper
const CACHE_NAME = 'train-speak-helper-v1.1';
const STATIC_CACHE = 'static-v1.1';
const DYNAMIC_CACHE = 'dynamic-v1.1';

const STATIC_FILES = [
    '/Train-Speak-Helper/',
    '/Train-Speak-Helper/index.html',
    '/Train-Speak-Helper/styles.css',
    '/Train-Speak-Helper/script.js'
];

// インストール時の最適化
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('📦 Service Worker: キャッシュ作成');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => self.skipWaiting())
            .catch(error => console.warn('SW Install Error:', error))
    );
});

// アクティベート時のクリーンアップ
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('🗑️ 古いキャッシュを削除:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

// 効率的なフェッチ処理
self.addEventListener('fetch', event => {
    const { request } = event;
    const { url, method } = request;

    // GET リクエストのみキャッシュ
    if (method !== 'GET') return;

    // 外部リソースは直接フェッチ
    if (!url.includes(self.location.origin)) {
        return fetch(request);
    }

    event.respondWith(
        caches.match(request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(request)
                    .then(response => {
                        // レスポンスをクローンしてキャッシュ
                        if (response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(DYNAMIC_CACHE)
                                .then(cache => cache.put(request, responseClone))
                                .catch(console.warn);
                        }

                        return response;
                    });
            })
            .catch(() => {
                // オフライン時のフォールバック
                if (request.destination === 'document') {
                    return caches.match('/Train-Speak-Helper/index.html');
                }
            })
    );
});