const CACHE_NAME = 'poker-v6';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/game-logic.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Code+Pro:wght@400;600&display=swap'
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  // 即座にアクティベート
  self.skipWaiting();
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // 即座にクライアントを制御
  self.clients.claim();
});

// フェッチ時の戦略: Network First (最新優先)
// HTMLファイルはネットワーク優先、静的アセットはキャッシュ優先
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // HTMLと重要なJS/CSSはネットワーク優先
  if (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // ネットワーク成功: キャッシュを更新して返す
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // オフライン: キャッシュから返す
          return caches.match(event.request);
        })
    );
    return;
  }

  // 静的アセット (フォント、画像) はキャッシュ優先
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // バックグラウンドでキャッシュを更新
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {});
          return response;
        }

        return fetch(event.request).then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        });
      })
      .catch(() => {
        // オフラインでキャッシュもない場合
      })
  );
});
