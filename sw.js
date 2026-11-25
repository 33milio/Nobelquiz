// Service worker: sparar appen i telefonen så att den fungerar utan internet.
// Ändra VERSION när filerna uppdateras, så hämtar telefonen den nya versionen.
const VERSION = 'nobelquiz-8';
const FILER = ['./', 'index.html', 'stil.css', 'app.js', 'data.json', 'data-august.json', 'manifest.webmanifest',
  'ikoner/ikon.svg', 'ikoner/ikon-180.png', 'ikoner/ikon-192.png', 'ikoner/ikon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILER)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSION).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});
// Försök hämta nytt från nätet, annars använd sparad kopia (fungerar offline).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(svar => {
      const kopia = svar.clone();
      caches.open(VERSION).then(c => c.put(e.request, kopia));
      return svar;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
