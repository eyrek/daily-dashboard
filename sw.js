// Service worker: same-origin files only. Network first with a short timeout (fresh code when online,
// instant fallback on weak signal), cached copy when offline. Other sites (weather, news, fonts) are left alone.
const C = 'deck-v8';
const SHELL = ['./', 'index.html', 'dashboard/', 'dashboard/index.html', 'dashboard/manifest.json', 'dashboard/icon-192.png', 'deck-core.js', 'deck-ui.js', 'deck.css', 'deck-push.js', 'deck-notify.js', 'deck-calendar.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'badge-96.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('timeout')), ms); p.then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); }); });
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(C);
    const network = fetch(req, { cache: 'no-cache' }).then(r => {
      if (r && r.ok && r.type === 'basic') cache.put(req, r.clone()).catch(() => {});
      return r;
    });
    try {
      return await withTimeout(network, 2500);
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) { network.catch(() => {}); return hit; }
      if (req.mode === 'navigate') { const page = await cache.match(url.pathname.includes('/dashboard/') ? 'dashboard/index.html' : 'index.html'); if (page) return page; }
      return network; // nothing cached: wait for the network after all
    }
  })());
});

/* ---------- notifications ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Dashboard', {
    body: d.body || '', icon: 'icon-192.png', badge: 'badge-96.png', tag: d.tag || 'deck', renotify: true,
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { try { await w.navigate(url); } catch (err) {} if ('focus' in w) return w.focus(); }
    return self.clients.openWindow(url);
  })());
});
