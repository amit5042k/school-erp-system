// Service worker for the installed School ERP app (PWA): an offline screen, fast reloads of the app's own
// static files, and Web Push notifications. School data (the API) is never cached on the device.
const VERSION = 'erp-v1';
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // the API and other sites: straight to the network
  if (req.mode === 'navigate') {                                   // pages: always fresh; offline screen without internet
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {   // versioned files never change
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: 'School ERP', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'School ERP', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.inbox_id ? `inbox-${data.inbox_id}` : undefined,
    data: { link: data.link || '/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/notifications';
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if (w.url.startsWith(self.location.origin)) { w.focus(); return w.navigate(target); }
    return self.clients.openWindow(target);
  }));
});
