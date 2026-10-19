// 매일성경 서비스 워커 — 앱 설치(홈 화면/데스크톱)를 위한 최소 구성
// - 화면 파일(HTML/CSS/JS/아이콘)만 "네트워크 우선, 끊기면 캐시"로 보관
// - /api/* (본문 데이터)는 절대 캐시하지 않고 항상 네트워크로
const CACHE = 'qt-shell-v3';
const SHELL = ['/', '/style.css', '/app.js', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'];

// 미리 담기는 "되는 만큼만" — 하나라도 실패하면 설치 자체가 실패하는 addAll 대신
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // ?date= 같은 쿼리가 붙어도 같은 화면 파일로 보관
  const key = url.origin + (req.mode === 'navigate' ? '/' : url.pathname);
  event.respondWith(
    // 브라우저 HTTP 캐시가 옛 app.js 를 그냥 내주는 경우가 있어서, 온라인이면 항상 서버에 확인(바뀐 게 없으면 304)
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key))
  );
});
