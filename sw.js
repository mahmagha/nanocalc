/*
 * NanoCalc service worker: makes the app work offline and installable.
 *
 * Install: caches every file the app needs. The file list is read from index.html
 * (its <script src> and <link href> tags, so new calculator files are picked up
 * automatically) plus the KaTeX files listed in vendor/katex/…/SRI.json.
 *
 * Fetch: network first, cache as fallback. Online users always get the current
 * files (no stale scripts after an update); offline users get the cached copy.
 * Each successful response refreshes the cache.
 *
 * App files are fetched with cache: 'no-cache' so the browser revalidates them with
 * the server every time (a cheap 304 when unchanged). A plain fetch() would use the
 * HTTP cache, and GitHub Pages lets files be cached for 10 minutes: after a deploy a
 * visitor could then get a mix of old and new scripts (seen with v0.6.0 → v0.7.0).
 * The vendored KaTeX files live under a versioned path and never change, so they
 * keep normal HTTP caching.
 */
const CACHE = 'nanocalc-v2';
const KATEX = 'vendor/katex/0.16.11/';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-maskable.svg', 'sw.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = new Set(CORE);
    try {
      const html = await (await fetch('index.html', { cache: 'no-store' })).text();
      for (const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
        if (!/^(?:[a-z]+:|\/\/)/i.test(m[1])) urls.add(m[1]);
      }
    } catch (e) { /* offline during install: cache what we can */ }
    try {
      const sri = await (await fetch(KATEX + 'SRI.json', { cache: 'no-store' })).json();
      Object.keys(sri).forEach((f) => urls.add(KATEX + f));
    } catch (e) { /* ignore */ }
    await Promise.all([...urls].map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nanocalc-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const immutable = new URL(req.url).pathname.indexOf('/' + KATEX) >= 0;
      // A navigation Request cannot be re-used with an init object, so refetch it by URL.
      const res = immutable ? await fetch(req)
        : req.mode === 'navigate' ? await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
          : await fetch(req, { cache: 'no-cache' });
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
