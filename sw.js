// sw.js: o "service worker" guarda uma cópia do Radiola no aparelho,
// para ele abrir mesmo sem internet (as suas músicas já ficam no IndexedDB).
// Estratégia: tenta a internet primeiro (assim você recebe as atualizações);
// sem internet, usa a cópia guardada.
const CACHE = 'radiola-v2';
const ARQUIVOS = ['./', 'index.html', 'estilo.css', 'nucleo.js', 'banco.js', 'app.js',
  'icone.svg', 'icone-192.png', 'icone-512.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
