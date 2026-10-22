'use strict';
// Offline support. Everything in data/precache.json is stored on install, then served from the cache.
// Browsers only look for a new worker when THIS FILE changes, so tools/build_data.py stamps the build
// version on the next line. A new build therefore changes sw.js, installs a fresh cache in the
// background, and the page offers "Update available"; the new version takes over on reload.
const BUILD = '9195e48cdc';

const PREFIX = 'hanzi-';

let installedCache = null;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // always ask the network (not the HTTP cache) for the file list, so a new version is noticed
    const list = await (await fetch('data/precache.json', { cache: 'no-store' })).json();
    installedCache = PREFIX + list.version;
    const cache = await caches.open(installedCache);
    const urls = ['./', 'audio/manifest.json', ...list.files];
    // cache.addAll is all-or-nothing, so a failed download never leaves a half-filled cache
    await cache.addAll(urls.map((u) => new Request(u, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // the worker may have been stopped since install, so find the newest cache by looking at what is stored
    const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX));
    const keep = installedCache || (await newestCache(names));
    for (const name of names) if (name !== keep) await caches.delete(name);
    await self.clients.claim();
  })());
});

// the cache that has the most recently written app page is the current one
async function newestCache(names) {
  let best = null, bestTime = -1;
  for (const n of names) {
    const r = await (await caches.open(n)).match('data/precache.json');
    const t = r ? Date.parse(r.headers.get('date') || 0) || 0 : 0;
    if (t >= bestTime) { best = n; bestTime = t; }
  }
  return best;
}

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Safari asks for audio in byte ranges and refuses to play if the worker ignores that,
// so slice the cached file ourselves and answer with 206 Partial Content.
async function rangeResponse(request, response) {
  const header = request.headers.get('range');
  const buf = await response.arrayBuffer();
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || (m[1] === '' && m[2] === '')) return new Response(buf, { status: 200, headers: response.headers });
  const size = buf.byteLength;
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }   // last N bytes
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    // search ignores the query string; the page itself is always served from the cache for offline start
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return req.headers.has('range') ? rangeResponse(req, hit) : hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') return (await caches.match('./')) || Response.error();
      return Response.error();
    }
  })());
});
