// SPDX-License-Identifier: AGPL-3.0-only
// Service Worker – macht KOMPASS installierbar und hält die App-Hülle offline bereit.
// Daten (api/, Mastodon, Bluesky) kommen immer frisch aus dem Netz.
const VERSION = 'kompass-v0-56';
// Je Instanz eigener Cache (mehrere Instanzen auf einer Domain, z. B. /kompass und /kompass-vorschau)
const CACHE = VERSION + '@' + self.registration.scope;
const SHELL = ['./', './index.html', './instanz.js', './app.css', './ki/ki-modus.css', './lang/en.js', './lang/i18n.js', './kern/basis.js', './kern/zentrale.js', './quellen/laden.js', './kern/daten.js', './kern/navigation.js', './kern/modi.js', './ki/agent.js', './kern/speicher.js', './ki/ki.js', './ki/ki-modus.js', './kern/geruest.js', './social/karten.js', './social/buehne.js', './quellen/hinzufuegen.js', './quellen/opml.js', './quellen/paket.js', './posten/posten.js', './posten/schreiben.js', './posten/posten.css', './kern/einstellungen.js', './kern/startseite.js', './kern/melden.js', './kern/start.js', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (!k.includes('@') || k.endsWith('@' + self.registration.scope))).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  // Netz zuerst, Cache als Rückfall (so kommen Updates sofort an)
  e.respondWith(
    fetch(e.request)
      .then((r) => { const kopie = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, kopie)); return r; })
      .catch(() => caches.match(e.request))
  );
});
