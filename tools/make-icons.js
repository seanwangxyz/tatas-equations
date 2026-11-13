#!/usr/bin/env node
// Draws the app icon (Pip the cube holding an "=" cube on the pitch) as SVG and renders every PNG the
// home-screen app needs, using a headless Chrome or Edge that is already on the computer (no npm packages).
//   node tools/make-icons.js            all icons + iPad/iPhone launch pictures
//   node tools/make-icons.js --no-splash   icons only
// Set CHROME=/path/to/chrome if it is not found. Output: assets/icons/ (commit the files).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'icons');
const INK = '#16203c';

// ---------- the drawing (512 x 512 units) ----------
function defs() {
  return '<defs>' +
    '<radialGradient id="bg" cx="50%" cy="34%" r="75%"><stop offset="0" stop-color="#36a872"/><stop offset=".62" stop-color="#1b7a4f"/><stop offset="1" stop-color="#0c3f2a"/></radialGradient>' +
    '<linearGradient id="pip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffec8f"/><stop offset="1" stop-color="#ffbe12"/></linearGradient>' +
    '<linearGradient id="die" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e9f5"/></linearGradient>' +
    '</defs>';
}
// Pitch background: radial light and mowing stripes.
function background() {
  let s = '<rect width="512" height="512" fill="url(#bg)"/>';
  for (let i = 0; i < 8; i += 2) s += '<rect x="' + (i * 64) + '" y="0" width="64" height="512" fill="#000" fill-opacity=".07"/>';
  return s;
}
// Pip, centred around (256, 270). Big face shapes so it still reads at 60 px.
function pip() {
  return '<g>' +
    '<ellipse cx="256" cy="452" rx="150" ry="20" fill="#000" fill-opacity=".22"/>' +
    // antenna
    '<path d="M256 118 V64" stroke="#e8590c" stroke-width="16" stroke-linecap="round"/>' +
    '<circle cx="256" cy="56" r="24" fill="#ff6b6b" stroke="#c92a2a" stroke-width="8"/>' +
    '<circle cx="248" cy="48" r="7" fill="#fff" fill-opacity=".75"/>' +
    // body: shadow side, then the face
    '<rect x="98" y="132" width="316" height="316" rx="86" fill="#c96a00"/>' +
    '<rect x="98" y="112" width="316" height="316" rx="86" fill="url(#pip)" stroke="#e8590c" stroke-width="16"/>' +
    '<rect x="138" y="134" width="132" height="28" rx="14" fill="#fff" fill-opacity=".62"/>' +
    // eyes
    '<ellipse cx="200" cy="246" rx="38" ry="45" fill="#fff" stroke="' + INK + '" stroke-width="7"/>' +
    '<ellipse cx="312" cy="246" rx="38" ry="45" fill="#fff" stroke="' + INK + '" stroke-width="7"/>' +
    '<circle cx="208" cy="254" r="22" fill="' + INK + '"/><circle cx="320" cy="254" r="22" fill="' + INK + '"/>' +
    '<circle cx="216" cy="243" r="8" fill="#fff"/><circle cx="328" cy="243" r="8" fill="#fff"/>' +
    // cheeks and smile
    '<circle cx="150" cy="318" r="20" fill="#ff8787" fill-opacity=".6"/><circle cx="362" cy="318" r="20" fill="#ff8787" fill-opacity=".6"/>' +
    '<path d="M196 312 Q256 388 316 312 Z" fill="#c92a2a" stroke="' + INK + '" stroke-width="12" stroke-linejoin="round"/>' +
    '<path d="M222 344 Q256 366 290 344 Q256 330 222 344 Z" fill="#ff8787"/>' +
    '</g>';
}
// The little white game cube with "=" that Pip shows off (bottom right, tilted).
function die() {
  return '<g transform="rotate(-12 392 392)">' +
    '<rect x="318" y="330" width="148" height="148" rx="34" fill="#9aa6c2"/>' +
    '<rect x="318" y="316" width="148" height="148" rx="34" fill="url(#die)" stroke="' + INK + '" stroke-width="12"/>' +
    '<rect x="352" y="358" width="80" height="20" rx="10" fill="' + INK + '"/>' +
    '<rect x="352" y="400" width="80" height="20" rx="10" fill="' + INK + '"/>' +
    '</g>';
}
function art() { return pip() + die(); }

// kind: 'any' (full-bleed square), 'maskable' (art inside the 80% safe circle), 'favicon' (rounded corners, transparent).
function svg(kind) {
  let body;
  if (kind === 'maskable') body = background() + '<g transform="translate(256 262) scale(.66) translate(-256 -262)">' + art() + '</g>';
  else if (kind === 'favicon') body = '<clipPath id="rr"><rect width="512" height="512" rx="112"/></clipPath><g clip-path="url(#rr)">' + background() + '<g transform="translate(256 256) scale(1.08) translate(-262 -262)">' + art() + '</g></g>';
  else body = background() + '<g transform="translate(256 262) scale(.92) translate(-256 -262)">' + art() + '</g>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' + defs() + body + '</svg>';
}

// Launch picture: flat pitch green (the page background, so no flash and small files), Pip in the middle, the game name below (fonts from vendor/fonts).
function splashHTML(w, h) {
  const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'vendor', 'fonts', f)).toString('base64'); // inline, so it is ready before the screenshot
  const side = Math.round(Math.min(w, h) * 0.34);
  const fs1 = Math.round(Math.min(w, h) * 0.075);
  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '@font-face{font-family:L;src:url("' + font('lilita-one-latin.woff2') + '")}' +
    'html,body{margin:0;width:' + w + 'px;height:' + h + 'px;overflow:hidden;background:#0f4d33}' +
    '.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:' + Math.round(side * 0.12) + 'px}' +
    '.t{font-family:L,sans-serif;font-size:' + fs1 + 'px;color:#fff;letter-spacing:2px;-webkit-text-stroke:' + Math.round(fs1 * 0.09) + 'px ' + INK + ';paint-order:stroke fill;text-shadow:0 ' + Math.round(fs1 * 0.07) + 'px 0 #0b1730;text-align:center;line-height:1}' +
    '.t b{display:block;color:#ffc83d;font-weight:400}' +
    '</style></head><body><div class="c"><svg viewBox="40 20 450 480" width="' + side + '" height="' + Math.round(side * 480 / 450) + '">' + defs() + art() + '</svg>' +
    '<div class="t">Tata\'s<b>Equations</b></div></div></body></html>';
}

// iPad and iPhone screens (CSS points and pixel ratio) for apple-touch-startup-image.
const SCREENS = [
  [1024, 1366, 2], [834, 1194, 2], [834, 1112, 2], [820, 1180, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2], // iPads
  [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [414, 896, 2], [375, 812, 3], [375, 667, 2], // iPhones
];

// ---------- rendering with headless Chrome / Edge ----------
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome or Edge found. Set CHROME=/path/to/chrome');
}
const CHROME = findChrome();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tata-icons-'));
const PROFILE = path.join(TMP, 'profile');

function shoot(html, w, h, outFile) {
  const src = path.join(TMP, 'page.html');
  fs.writeFileSync(src, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + PROFILE,
    '--default-background-color=00000000', '--force-device-scale-factor=1', '--window-size=' + w + ',' + h,
    '--virtual-time-budget=3000', '--screenshot=' + outFile, 'file:///' + src.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 60000 });
  const b = fs.readFileSync(outFile); // PNG header: width and height at bytes 16-23
  const W = b.readUInt32BE(16), H = b.readUInt32BE(20);
  if (W !== w || H !== h) throw new Error(outFile + ': got ' + W + 'x' + H + ', wanted ' + w + 'x' + h);
  console.log(String(w + 'x' + h).padEnd(10) + path.relative(ROOT, outFile).replace(/\\/g, '/') + '  ' + (b.length / 1024).toFixed(0) + ' KB');
}
function iconPage(kind, n) {
  return '<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:' + n + 'px;height:' + n + 'px}</style></head><body>' + svg(kind) + '</body></html>';
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg('favicon') + '\n');
fs.writeFileSync(path.join(OUT, 'icon-full.svg'), svg('any') + '\n');
fs.writeFileSync(path.join(OUT, 'icon-maskable.svg'), svg('maskable') + '\n');
const ICONS = [
  ['any', 192, 'icon-192.png'], ['any', 512, 'icon-512.png'],
  ['maskable', 192, 'icon-maskable-192.png'], ['maskable', 512, 'icon-maskable-512.png'],
  ['any', 180, 'apple-touch-icon.png'], ['any', 167, 'apple-touch-icon-167.png'], ['any', 152, 'apple-touch-icon-152.png'], ['any', 120, 'apple-touch-icon-120.png'],
  ['favicon', 32, 'favicon-32.png'], ['favicon', 16, 'favicon-16.png'], ['favicon', 64, 'preview-64.png'],
];
try {
  for (const [kind, n, file] of ICONS) shoot(iconPage(kind, n), n, n, path.join(OUT, file));
  if (process.argv.indexOf('--no-splash') < 0) {
    fs.mkdirSync(path.join(OUT, 'splash'), { recursive: true });
    for (const [w, h, r] of SCREENS) {
      for (const [pw, ph] of [[w * r, h * r], [h * r, w * r]]) shoot(splashHTML(pw, ph), pw, ph, path.join(OUT, 'splash', 'launch-' + pw + 'x' + ph + '.png'));
    }
    // The <link> tags for index.html, printed so they never drift from the files.
    const links = SCREENS.flatMap(([w, h, r]) => [
      '<link rel="apple-touch-startup-image" media="(device-width: ' + w + 'px) and (device-height: ' + h + 'px) and (-webkit-device-pixel-ratio: ' + r + ') and (orientation: portrait)" href="assets/icons/splash/launch-' + (w * r) + 'x' + (h * r) + '.png">',
      '<link rel="apple-touch-startup-image" media="(device-width: ' + w + 'px) and (device-height: ' + h + 'px) and (-webkit-device-pixel-ratio: ' + r + ') and (orientation: landscape)" href="assets/icons/splash/launch-' + (h * r) + 'x' + (w * r) + '.png">',
    ]);
    fs.writeFileSync(path.join(OUT, 'splash', 'links.html'), links.join('\n') + '\n');
    console.log('Launch-picture <link> tags: assets/icons/splash/links.html');
  }
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}
