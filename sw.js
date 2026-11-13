// Tata's Equations: the service worker that lets the game run with no internet (one-device play).
// See docs/handoff/pwa.md. The file list comes from precache-manifest.js, made by  node tools/build-precache.js
// (which also stamps its version on the next line, so every publish is a new service worker).
'use strict';
importScripts('precache-manifest.js?v=302a28d3f3ff');

const P = self.PRECACHE || { version: 'none', files: [], cdn: [], warm: [] };
const PREFIX = 'tata-';
const PRE = PREFIX + 'pre-' + P.version;   // the whole game, one coherent version (HTML + scripts + assets)
const RUN = PREFIX + 'run-' + P.version;   // safety net: same-origin files the list did not know about
const XO = PREFIX + 'xo-v1';               // pinned CDN libraries and Google Fonts (fixed URLs, never change)
const SCOPE = self.registration.scope;     // e.g. https://profsean.wang/tatas-equations/
const INDEX = new URL('index.html', SCOPE).href;
const TEXT = /\.(js|css|html|json|webmanifest|svg|txt)$/i;
// The ONLY cross-origin requests this worker touches. Firebase (gstatic.com/firebasejs, firebaseio, Google sign-in)
// is never intercepted and never cached: online play and accounts always talk to the real network.
const XO_OK = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/(three@0\.170\.0|cannon-es@0\.20\.0)\/|fonts\.googleapis\.com\/css2|fonts\.gstatic\.com\/s\/)/;

const log = (...a) => { try { console.log('[sw ' + P.version + ']', ...a); } catch (e) {} };

async function hashOf(buf, file) {
  let b = new Uint8Array(buf);
  if (TEXT.test(file)) b = b.filter((x) => x !== 13); // the same CR-free hash tools/build-precache.js makes
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b));
  return Array.from(d.slice(0, 8), (x) => x.toString(16).padStart(2, '0')).join('');
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// ---------- install: download the full new version; the old one keeps running until the player taps Update ----------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRE);
    let fetched = 0, kept = 0, stale = 0, missing = 0;
    await pool(P.files, 6, async ([file, hash]) => {
      const url = new URL(file, SCOPE).href;
      const have = await cache.match(url);
      if (have && have.headers.get('x-tata-hash') === hash) { kept++; return; } // resumes a half-finished install
      // cache:'reload' skips the browser's HTTP cache (GitHub Pages says max-age=600, so it could hand back
      // a 10-minute-old file and mix versions). A network error throws: install fails, the old version stays.
      let res = await fetch(url, { cache: 'reload' });
      if (res.status === 404) { missing++; log('listed but missing (stale list?)', file); return; }
      if (!res.ok) throw new Error(file + ' HTTP ' + res.status);
      let buf = await res.arrayBuffer();
      if (await hashOf(buf, file) !== hash) {
        // A CDN edge may still hold the previous file for a moment after a publish: ask again with a unique URL.
        const r2 = await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'swv=' + hash, { cache: 'no-store' });
        if (!r2.ok) throw new Error(file + ' HTTP ' + r2.status);
        res = r2; buf = await r2.arrayBuffer();
        // Still different: the file changed after the list was built (someone forgot build-precache).
        // The server copy is the newest, so keep it rather than refuse to update.
        if (await hashOf(buf, file) !== hash) { stale++; log('newer than the list', file); }
      }
      const h = new Headers();
      h.set('content-type', res.headers.get('content-type') || 'application/octet-stream');
      h.set('x-tata-hash', hash);
      await cache.put(url, new Response(buf, { status: 200, headers: h }));
      fetched++;
    });
    log('installed', { fetched, kept, stale, missing, files: P.files.length });
    // Best effort, never fatal: the CDN copies (only listed while the import map still points at the CDN) and Google Fonts.
    const xo = await caches.open(XO);
    for (const u of P.cdn || []) {
      try { if (!(await xo.match(u))) { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await xo.put(u, r); } } catch (e) { log('cdn skipped', u); }
    }
    for (const u of P.warm || []) {
      try {
        const r = await fetch(u, { mode: 'cors' }); if (!r.ok) continue;
        await xo.put(u, r.clone());
        const css = await r.text();
        for (const m of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) if (!(await xo.match(m[1]))) { const f = await fetch(m[1], { mode: 'cors' }); if (f.ok) await xo.put(m[1], f); }
      } catch (e) { log('fonts skipped'); }
    }
    // No skipWaiting here: the page asks for it only when the player taps "New version ready" (or at a cold start).
  })());
});

// ---------- activate: drop every older cache ----------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== PRE && k !== RUN && k !== XO) await caches.delete(k);
    await self.clients.claim();
    log('active');
  })());
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  else if (d.type === 'VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: P.version, built: P.built, bytes: P.bytes, files: P.files.length });
});

// ---------- fetch ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!req.url.startsWith(SCOPE) || req.headers.has('range')) return;
    if (/\/(sw|precache-manifest)\.js$/.test(url.pathname)) return; // the update check itself always goes to the network
    event.respondWith(sameOrigin(event, req, url));
  } else if (req.method === 'GET' && XO_OK.test(req.url)) {
    event.respondWith(crossOrigin(event, req, url));
  }
  // anything else (Firebase, Google sign-in, other sites): not touched, straight to the network
});

const offline = () => new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'content-type': 'text/plain' } });
const head = (r) => new Response(null, { status: r.status, headers: r.headers });

async function sameOrigin(event, req, url) {
  const pre = await caches.open(PRE);
  const key = url.origin + url.pathname; // ?v=... cache busters on workers and scripts map to the same file
  // The game page (and the home-screen start URL): the active version's own copy, so the page and its scripts
  // always match. New versions arrive through install + the "New version ready" chip, never half-way.
  if (req.mode === 'navigate' && (key === SCOPE || key === INDEX)) {
    const hit = await pre.match(INDEX);
    if (hit) return hit;
    try { return await fetch(req); } catch (e) { return offline(); }
  }
  const hit = await pre.match(key);
  if (hit) return req.method === 'HEAD' ? head(hit) : hit;
  // Not in the list (new file, stale list, other pages): stale-while-revalidate in this version's runtime cache.
  const run = await caches.open(RUN);
  const cached = await run.match(req.method === 'HEAD' ? req.url : req);
  if (req.method === 'HEAD') {
    try { return await fetch(req); } catch (e) { return cached ? head(cached) : offline(); }
  }
  const net = fetch(req).then(async (r) => {
    if (r.ok && r.type === 'basic') await run.put(req, r.clone());
    return r;
  });
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; }
  try { return await net; } catch (e) {
    const any = (await run.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await pre.match(INDEX) : null);
    return any || offline();
  }
}

async function crossOrigin(event, req, url) {
  const xo = await caches.open(XO);
  const cached = await xo.match(req.url, { ignoreVary: true });
  const net = fetch(req).then(async (r) => { if (r.ok || r.type === 'opaque') await xo.put(req.url, r.clone()); return r; });
  if (cached) {
    if (url.hostname === 'fonts.googleapis.com') event.waitUntil(net.catch(() => {})); // the CSS may change; font files and pinned libraries never do
    return cached;
  }
  try { return await net; } catch (e) { return offline(); }
}
