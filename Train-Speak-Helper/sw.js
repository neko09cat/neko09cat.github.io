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

// 問題のあるキャッシュ処理を修正
self.addEventListener('fetch', event => {
    const { request } = event;

    // index.htmlの処理を最適化
    if (request.url.includes('index.html') || request.url.endsWith('/')) {
        event.respondWith(
            // ネットワークファーストで最新版を優先
            fetch(request)
                .then(response => {
                    // 成功時のみキャッシュ更新
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, responseClone))
                            .catch(console.warn);
                    }
                    return response;
                })
                .catch(() => {
                    // ネットワークエラー時のみキャッシュから取得
                    return caches.match(request);
                })
        );
        return;
    }

    // その他のリソースは通常のキャッシュファースト
    event.respondWith(
        caches.match(request)
            .then(response => response || fetch(request))
    );
});