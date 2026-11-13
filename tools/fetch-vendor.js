#!/usr/bin/env node
// Downloads the pinned third-party files the game needs into vendor/, so the game (and the home-screen app)
// does not depend on a CDN at run time. Run it only when changing a library version; the files are committed.
//   node tools/fetch-vendor.js
// three.js r170 and cannon-es 0.20.0 are MIT licensed; Lilita One and Nunito are SIL Open Font License 1.1
// (licence notes: vendor/README.md). Only the addons the game imports are fetched; build-precache.js warns
// if a module imports a 'three/addons/...' file that is not here.
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
const CANNON = 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/';
const FILES = [
  [THREE + 'build/three.module.js', 'vendor/three/build/three.module.js'],
  [THREE + 'examples/jsm/loaders/GLTFLoader.js', 'vendor/three/examples/jsm/loaders/GLTFLoader.js'],
  [THREE + 'examples/jsm/utils/BufferGeometryUtils.js', 'vendor/three/examples/jsm/utils/BufferGeometryUtils.js'], // GLTFLoader imports it
  [THREE + 'examples/jsm/utils/SkeletonUtils.js', 'vendor/three/examples/jsm/utils/SkeletonUtils.js'],
  [THREE + 'examples/jsm/environments/RoomEnvironment.js', 'vendor/three/examples/jsm/environments/RoomEnvironment.js'],
  [THREE + 'LICENSE', 'vendor/three/LICENSE'],
  [CANNON + 'dist/cannon-es.js', 'vendor/cannon-es/cannon-es.js'],
  [CANNON + 'LICENSE', 'vendor/cannon-es/LICENSE'],
  // Fonts: the latin and latin-ext subsets Google Fonts serves for Lilita One 400 and Nunito 700-900 (one variable file).
  ['https://fonts.gstatic.com/s/lilitaone/v17/i7dPIFZ9Zz-WBtRtedDbYEF8RQ.woff2', 'vendor/fonts/lilita-one-latin.woff2'],
  ['https://fonts.gstatic.com/s/lilitaone/v17/i7dPIFZ9Zz-WBtRtedDbYE98RWq7.woff2', 'vendor/fonts/lilita-one-latin-ext.woff2'],
  ['https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2', 'vendor/fonts/nunito-latin.woff2'],
  ['https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofIO-aBXso.woff2', 'vendor/fonts/nunito-latin-ext.woff2'],
];

function get(url, redirects = 3) {
  return new Promise((ok, bad) => {
    https.get(url, { headers: { 'User-Agent': 'tatas-equations-vendor-script' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) { res.resume(); ok(get(new URL(res.headers.location, url).href, redirects - 1)); return; }
      if (res.statusCode !== 200) { res.resume(); bad(new Error(url + ' -> HTTP ' + res.statusCode)); return; }
      const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => ok(Buffer.concat(parts)));
    }).on('error', bad);
  });
}

(async () => {
  for (const [url, rel] of FILES) {
    const buf = await get(url);
    const out = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    console.log((buf.length / 1024).toFixed(0).padStart(6) + ' KB  ' + rel);
  }
  console.log('Done. Now run: node tools/build-precache.js');
})().catch((e) => { console.error(e.message); process.exit(1); });
