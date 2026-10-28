// Service worker de l'appli téléphone : notifications du planning (Web Push), ouverture de l'appli
// au bon écran quand on touche la notification, et dernière version de l'appli disponible sans réseau.
const CACHE = 'pipefit-appli-v3';
// Installation : toute l'appli (page, styles, scripts, icônes) est copiée pour démarrer sans réseau sur le chantier
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  try {
    const page = await fetch('/', { cache: 'no-store' });
    const html = await page.clone().text();
    await c.put('/', page);
    const fichiers = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?#]+)"/g)].map(m => `/${m[1]}`);
    await c.addAll([...new Set([...fichiers, '/manifest.webmanifest', '/icon-192.png'])].filter(Boolean)).catch(() => {});
  } catch (err) { /* hors ligne pendant l'installation : la copie se fera au fil des pages */ }
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Réseau d'abord (toujours la dernière version), copie de secours pour démarrer hors connexion ; jamais les données /api
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request)
    .then(r => { if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('/') : Response.error()))));
});

self.addEventListener('push', e => {
  let m;
  try { m = e.data.json(); } catch (err) { m = { titre: 'Pipe-Fit', texte: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(m.titre || 'Pipe-Fit', {
      body: m.texte || '', icon: '/icon-192.png', badge: '/badge-96.png', tag: m.tag || 'pipefit', renotify: true, lang: 'fr', data: { lien: m.lien || '' },
    });
    // Appli ouverte : elle met à jour sa cloche et son planning
    (await self.clients.matchAll({ type: 'window' })).forEach(c => c.postMessage({ type: 'push', message: m }));
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const lien = (e.notification.data && e.notification.data.lien) || '';
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const f = fenetres.find(w => new URL(w.url).origin === self.location.origin);
    if (f) { f.postMessage({ type: 'ouvrir', lien }); return f.focus(); }
    return self.clients.openWindow(`/${lien}`);
  })());
});
