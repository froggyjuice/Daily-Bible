// 매일성경 서비스 워커 — 앱 설치(홈 화면/데스크톱)를 위한 최소 구성
// - 화면 파일(HTML/CSS/JS/아이콘)만 "네트워크 우선, 끊기면 캐시"로 보관
// - /api/* (암호 쿠키·본문 데이터)는 절대 캐시하지 않고 항상 네트워크로
const CACHE = 'qt-shell-v1';
const SHELL = ['/', '/style.css', '/app.js', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
    fetch(req)
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
