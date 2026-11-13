#!/usr/bin/env node
// Builds the offline file list for the home-screen app. RUN BEFORE EVERY PUBLISH:
//   node tools/build-precache.js
// It scans index.html and the js/, css/, assets/ and vendor/ folders, writes precache-manifest.js
// (version + every file with a content hash and size) and stamps that version into sw.js, so phones and
// tablets notice the new version. If you forget, nothing breaks: the service worker still fetches new or
// changed files from the internet (it checks each file against the list and also caches files it does not know).
// Options: --check  only report (exit 1 if precache-manifest.js is out of date; changes nothing).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const DIRS = ['js', 'css', 'assets', 'vendor'];
const TOP = ['index.html', 'manifest.webmanifest'];
// Not needed to play: notes, tools, launch pictures (iOS reads those itself), licences, the icon preview.
const SKIP = [/\.md$/i, /(^|\/)tools\//, /^assets\/icons\/splash\//, /(^|\/)LICENSE$/, /^assets\/icons\/preview-64\.png$/, /\.mjs$/, /(^|\/)\./];
// Text files are hashed without carriage returns: git on Windows checks files out with CRLF but publishes LF,
// and sw.js strips CR the same way before comparing, so the hash matches what GitHub Pages serves.
const TEXT = /\.(js|css|html|json|webmanifest|svg|txt)$/i;
// Same bytes on the CDN and in vendor/, used only if the import map still points at the CDN.
const CDN_MIRROR = {
  'https://cdn.jsdelivr.net/npm/three@0.170.0/': 'vendor/three/',
  'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/': 'vendor/cannon-es/',
};

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(rel(p));
  }
  return out;
}
function hashOf(file) {
  let b = fs.readFileSync(path.join(ROOT, file));
  if (TEXT.test(file)) b = Buffer.from(b.filter((x) => x !== 13));
  return { hash: crypto.createHash('sha256').update(b).digest('hex').slice(0, 16), size: b.length };
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const warnings = [];

// 1. Every local file the page names directly (scripts, styles, icons, manifest).
const named = new Set();
for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)[^"']*["']/gi)) {
  const u = m[1];
  if (/^(https?:|data:|mailto:|\/\/)/i.test(u)) continue;
  if (/apple-touch-startup-image/.test(html.slice(Math.max(0, m.index - 120), m.index))) continue; // launch pictures
  named.add(u.replace(/^\.\//, ''));
}
for (const u of named) if (!fs.existsSync(path.join(ROOT, u))) warnings.push('index.html names ' + u + ' but the file is missing');

// 2. Everything under the asset folders.
const files = new Set(TOP.filter((f) => fs.existsSync(path.join(ROOT, f))));
for (const d of DIRS) for (const f of walk(path.join(ROOT, d), [])) if (!SKIP.some((r) => r.test(f))) files.add(f);
for (const u of named) if (fs.existsSync(path.join(ROOT, u)) && !SKIP.some((r) => r.test(u))) files.add(u);

// 3. The import map: local targets must exist; CDN targets are listed for cross-origin caching.
const cdn = [];
const im = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
let imports = {};
if (im) { try { imports = JSON.parse(im[1]).imports || {}; } catch (e) { warnings.push('the import map is not valid JSON'); } }
function resolveSpec(spec) {
  if (imports[spec]) return imports[spec];
  const pre = Object.keys(imports).filter((k) => k.endsWith('/') && spec.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return pre ? imports[pre] + spec.slice(pre.length) : null;
}
const specs = new Set();
for (const f of files) {
  if (!/\.js$/.test(f) || f.startsWith('vendor/')) continue;
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([@a-z][\w@\-./]*)['"]/gi)) specs.add(m[1]); // bare specifiers only
}
for (const spec of specs) {
  const target = resolveSpec(spec);
  if (!target) { warnings.push('no import-map entry for "' + spec + '"'); continue; }
  if (/^https?:/.test(target)) {
    cdn.push(target);
    const base = Object.keys(CDN_MIRROR).find((b) => target.startsWith(b));
    if (!base) warnings.push(spec + ' comes from ' + target + ' (not mirrored in vendor/: it works offline only after it was loaded once online)');
  } else {
    const local = target.replace(/^\.\//, '');
    if (!fs.existsSync(path.join(ROOT, local))) warnings.push(spec + ' -> ' + local + ' is missing (run node tools/fetch-vendor.js, or add the file to it)');
  }
}
// Files the CDN modules pull in themselves (GLTFLoader -> BufferGeometryUtils): add the mirror's siblings.
if (cdn.length) {
  for (const [base, dir] of Object.entries(CDN_MIRROR)) {
    if (!cdn.some((u) => u.startsWith(base))) continue;
    for (const f of walk(path.join(ROOT, dir), [])) if (/\.js$/.test(f)) cdn.push(base + f.slice(dir.length));
  }
}
const fontsLink = /fonts\.googleapis\.com\/css2[^"']*/.exec(html);
const warm = fontsLink ? ['https://' + fontsLink[0].replace(/&amp;/g, '&')] : [];

// 4. Hash, version, write.
const list = [...files].sort().map((f) => { const h = hashOf(f); return [f, h.hash, h.size]; });
const version = crypto.createHash('sha256').update(JSON.stringify([list, [...new Set(cdn)].sort(), warm])).digest('hex').slice(0, 12);
const total = list.reduce((n, x) => n + x[2], 0);
const body = '// Made by tools/build-precache.js. Do not edit by hand: run  node tools/build-precache.js  before publishing.\n' +
  'self.PRECACHE = ' + JSON.stringify({
    version, built: new Date().toISOString(), bytes: total,
    files: list, cdn: [...new Set(cdn)].sort(), warm,
  }, null, 0).replace(/\],\[/g, '],\n[') + ';\n';

const outFile = path.join(ROOT, 'precache-manifest.js');
const old = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
const oldVersion = (old.match(/"version":"([0-9a-f]+)"/) || [])[1];
const swFile = path.join(ROOT, 'sw.js');
const sw = fs.readFileSync(swFile, 'utf8');
const stamp = /importScripts\('precache-manifest\.js\?v=[0-9a-z]*'\)/;
if (!stamp.test(sw)) { console.error('sw.js has no  importScripts(\'precache-manifest.js?v=...\')  line to stamp.'); process.exit(1); }

warnings.forEach((w) => console.warn('WARNING: ' + w));
console.log(list.length + ' files, ' + (total / 1048576).toFixed(2) + ' MB' + (cdn.length ? ', plus ' + new Set(cdn).size + ' CDN files' : '') + (warm.length ? ', plus Google Fonts' : ''));
if (CHECK) {
  const ok = oldVersion === version && sw.includes("precache-manifest.js?v=" + version + "'");
  console.log(ok ? 'Up to date (version ' + version + ').' : 'OUT OF DATE: run  node tools/build-precache.js');
  process.exit(ok ? 0 : 1);
}
if (oldVersion === version) {
  console.log('No file changed since the last build (version ' + version + '). Nothing to do.');
} else {
  fs.writeFileSync(outFile, body);
  fs.writeFileSync(swFile, sw.replace(stamp, "importScripts('precache-manifest.js?v=" + version + "')"));
  console.log('New version ' + version + (oldVersion ? ' (was ' + oldVersion + ')' : '') + ': wrote precache-manifest.js and stamped sw.js. Commit both and publish.');
}
