#!/usr/bin/env node
// Applies the home-screen-app edits to index.html and js/screens.js (the files the PWA helper does not own).
//   node tools/pwa-snippets.js           apply (safe to run twice: an edit already in place is skipped)
//   node tools/pwa-snippets.js --check   only report what is applied / missing
// The same edits, written out for review, are in docs/handoff/pwa.md. After applying: node tools/build-precache.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

const links = fs.readFileSync(path.join(ROOT, 'assets/icons/splash/links.html'), 'utf8').replace(/\r\n/g, '\n').trim();
const EDITS = [
  { name: 'head: icons, launch pictures, fonts from vendor/', file: 'index.html',
    from: '<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap">',
    to: '<link rel="icon" type="image/png" sizes="16x16" href="assets/icons/favicon-16.png">\n<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">\n<link rel="apple-touch-icon" sizes="180x180" href="assets/icons/apple-touch-icon.png">\n<link rel="apple-touch-icon" sizes="167x167" href="assets/icons/apple-touch-icon-167.png">\n<link rel="apple-touch-icon" sizes="152x152" href="assets/icons/apple-touch-icon-152.png">\n<link rel="apple-touch-icon" sizes="120x120" href="assets/icons/apple-touch-icon-120.png">\n<!-- PWA: launch pictures for the home-screen app (iPad and iPhone), made by tools/make-icons.js -->\n' + links + '\n<link rel="stylesheet" href="vendor/fonts/fonts.css"><!-- PWA: fonts from this site, so they work offline -->' },
  { name: 'head: css/pwa.css', file: 'index.html',
    from: '<link rel="stylesheet" href="css/onsets.css"><!-- ON-SETS: the sister game -->',
    to: '<link rel="stylesheet" href="css/onsets.css"><!-- ON-SETS: the sister game -->\n<link rel="stylesheet" href="css/pwa.css"><!-- PWA: home-screen app chips -->' },
  { name: 'import map: three.js and cannon-es from vendor/', file: 'index.html',
    from: '  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",\n  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",\n  "cannon-es": "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js"',
    to: '  "three": "./vendor/three/build/three.module.js",\n  "three/addons/": "./vendor/three/examples/jsm/",\n  "cannon-es": "./vendor/cannon-es/cannon-es.js"' },
  { name: 'script: js/pwa.js before js/main.js', file: 'index.html',
    from: '<script src="js/main.js"></script>',
    to: '<script src="js/pwa.js"></script><!-- PWA: offline app, updates, install helper -->\n<script src="js/main.js"></script>' },
  { name: 'Settings: "App on this device" group', file: 'js/screens.js',
    from: "    (window.Account ? Account.panelHTML() : '') + // ACCOUNT\n",
    to: "    (window.Account ? Account.panelHTML() : '') + // ACCOUNT\n    (window.PWA ? PWA.settingsHTML() : '') + // PWA: app on this device (install, offline, updates)\n" },
  { name: 'Parent corner: Reset app cache', file: 'js/screens.js',
    from: "    '<div class=\"setrow\"><label>Start over from zero</label>",
    to: "    (window.PWA ? PWA.parentRowHTML() : '') + // PWA: Reset app cache\n    '<div class=\"setrow\"><label>Start over from zero</label>" },
];

let missing = 0;
const texts = {};
for (const e of EDITS) {
  const f = path.join(ROOT, e.file);
  if (!(e.file in texts)) { const raw = fs.readFileSync(f, 'utf8'); texts[e.file] = { crlf: raw.includes('\r\n'), s: raw.replace(/\r\n/g, '\n'), changed: false }; }
  const t = texts[e.file];
  const marker = e.to.split('\n').find((l) => !e.from.includes(l)) || e.to; // a line only the applied version has
  if (t.s.includes(marker)) { console.log('ok      ' + e.name); continue; }
  const n = t.s.split(e.from).length - 1;
  if (n !== 1) { console.log('MISSING ' + e.name + ' (anchor found ' + n + ' times: apply by hand, see docs/handoff/pwa.md)'); missing++; continue; }
  if (CHECK) { console.log('todo    ' + e.name); missing++; continue; }
  t.s = t.s.replace(e.from, e.to); t.changed = true; console.log('applied ' + e.name);
}
if (!CHECK) for (const [file, t] of Object.entries(texts)) if (t.changed) fs.writeFileSync(path.join(ROOT, file), t.crlf ? t.s.replace(/\n/g, '\r\n') : t.s);
if (!CHECK) console.log('Next: node tools/build-precache.js');
process.exit(missing ? 1 : 0);
