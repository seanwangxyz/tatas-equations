// Look-and-feel helpers for the 3D table: environment lighting, procedural textures, and a
// stylised place around the table for each mat theme (felt = cozy room, space, jungle, ocean).
// Everything here is generated in code (no image downloads) and is static: nothing idles or wobbles.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildStadium } from './stadium.js';
import { buildBeach } from './arenas/beach.js';
import { buildVolcano } from './arenas/volcano.js';

export var FLOOR_Y = -5;

// Per-theme mood: lights, felt colour, rim material, backdrop gradient, dust colour.
export var THEMES = {
  felt:   { felt: '#2e8b57', rim: '#8b5a2b', rimMetal: 0.0, rimRough: 0.42, sun: 0xfff0d8, sunI: 2.5, fill: 0xffc98f, fillI: 0.55, sky: 0xfff4e6, ground: 0x6b4a2a, hemiI: 0.7, env: 0.55, bg: ['#47321f', '#150e09'], dust: 0xfff1d6, legs: true,  fog: [0x2a1c12, 60, 150] },
  space:  { felt: '#2b2f77', rim: '#2a3050', rimMetal: 0.75, rimRough: 0.3, sun: 0xd3dcff, sunI: 2.1, fill: 0xff58d8, fillI: 1.0, sky: 0x8fa0ff, ground: 0x1a1040, hemiI: 0.7, env: 0.42, bg: ['#10123a', '#02020a'], dust: 0xbfd0ff, legs: false, fog: null },
  jungle: { felt: '#3f7f2f', rim: '#5d4322', rimMetal: 0.0, rimRough: 0.65, sun: 0xfff2b8, sunI: 2.7, fill: 0x7dffa0, fillI: 0.5, sky: 0xe2ffd8, ground: 0x244018, hemiI: 0.8, env: 0.5, bg: ['#2a5226', '#0a1a0a'], dust: 0xeaffc4, legs: true,  fog: [0x16301a, 45, 120] },
  stadium:{ felt: '#2fa84f', rim: '#e9ecef', rimMetal: 0.0, rimRough: 0.35, apron: 0x8793a6, sun: 0xf0f5ff, sunI: 2.1, fill: 0xa8c0ff, fillI: 0.45, sky: 0xd5e4ff, ground: 0x1d4a26, hemiI: 0.6, env: 0.42, bg: ['#0c1638', '#03060f'], dust: 0xe8f5e0, spark: 0xfff0b0, legs: true, fog: [0x0a1330, 60, 150] },
  ocean:  { felt: '#1c6ea4', rim: '#caa56a', rimMetal: 0.0, rimRough: 0.5, sun: 0xfff8ee, sunI: 2.8, fill: 0x62dcff, fillI: 0.6, sky: 0xeaf7ff, ground: 0x0a3a5a, hemiI: 0.9, env: 0.6, bg: ['#79c9f0', '#0b4a78'], dust: 0xffffff, legs: true,  fog: [0x2a7fb0, 55, 150] },
  // Venues with their own key light (js/three/arenas/): sun/fill here are the softer helpers around it.
  night:  { felt: '#2fa84f', rim: '#e9ecef', rimMetal: 0.0, rimRough: 0.35, apron: 0x6c7689, sun: 0xf0f5ff, sunI: 1.15, fill: 0x7d96ff, fillI: 0.35, sky: 0x8ea4d8, ground: 0x0b1d12, hemiI: 0.22, env: 0.2, bg: ['#040818', '#000105'], dust: 0xe0ecff, spark: 0xfff0b0, legs: true, fog: [0x030714, 55, 140] },
  beach:  { felt: '#178a85', rim: '#d2ad7c', rimMetal: 0.0, rimRough: 0.55, apron: 0xb08a62, sun: 0xfff6e6, sunI: 1.3, fill: 0x9fe6ff, fillI: 0.45, sky: 0xe6f6ff, ground: 0xd9bf8a, hemiI: 0.75, env: 0.5, bg: ['#5fb8ea', '#d4f0fb'], dust: 0xfff3d6, spark: 0xfff4b0, legs: true, fog: [0xcde9f4, 60, 175] },
  volcano:{ felt: '#4f3a9a', rim: '#6d5c7c', rimMetal: 0.0, rimRough: 0.7, apron: 0x5d4d6c, sun: 0xffe6cf, sunI: 1.0, fill: 0xff8a3d, fillI: 0.55, sky: 0xffc8a8, ground: 0x4a2a44, hemiI: 0.6, env: 0.4, bg: ['#3a1f5c', '#f0905a'], dust: 0xffdcb8, spark: 0xffb347, legs: true, fog: [0x47264a, 70, 165] }
};

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function cvs(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(cv, aniso, rep, srgb) {
  var t = new THREE.CanvasTexture(cv);
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso || 1;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function hexCss(h) { return '#' + new THREE.Color(h).getHexString(); }
function shade(css, k) { var c = new THREE.Color(css); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); }

// ----- Lighting environment (RoomEnvironment through PMREM: soft reflections on dice and wood) -----
export function makeEnvMap(renderer) {
  var pm = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), rt = pm.fromScene(room, 0.04);
  pm.dispose();
  if (room.dispose) room.dispose();
  return rt.texture;
}

// ----- Small shared textures -----
export function softTexture() {
  var c = cvs(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return ctex(c, 1);
}
export function blobTexture() {
  var c = cvs(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return ctex(c, 1);
}
export function vignetteTexture() {
  var c = cvs(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 30, 64, 64, 92);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.65, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return ctex(c, 1);
}
export function gradientBg(stops) {
  var c = cvs(4, 256), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, stops[0]); gr.addColorStop(1, stops[1]); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return ctex(c, 1);
}
// A soft rectangular shadow (blurred with shadowBlur, which every browser supports).
export function rectShadowTexture() {
  var c = cvs(256, 256), g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 38; g.shadowOffsetX = 1000;
  g.fillStyle = '#000'; g.fillRect(-1000 + 70, 70, 116, 116);
  return ctex(c, 1);
}

// ----- Felt: fibre bump tile, and decoration for the base colour -----
export function feltBumpTile() {
  var c = cvs(256, 256), g = c.getContext('2d'), id = g.createImageData(256, 256), R = rng(5);
  for (var i = 0; i < id.data.length; i += 4) { var v = 110 + R() * 90; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  var t = ctex(c, 4, [1, 1], false); return t;
}
export function paintFelt(g, w, h, theme, name) {
  var R = rng(11);
  g.fillStyle = theme.felt; g.fillRect(0, 0, w, h);
  // large soft light/dark clouds so the cloth does not look flat
  for (var i = 0; i < 26; i++) {
    var x = R() * w, y = R() * h, r = (0.1 + R() * 0.22) * Math.min(w, h), gr = g.createRadialGradient(x, y, 0, x, y, r), dark = R() < 0.5;
    gr.addColorStop(0, dark ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (var k = 0; k < 14000; k++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(R() * w, R() * h, 2, 2); }
  if (name === 'space') { for (var s = 0; s < 260; s++) { g.fillStyle = 'rgba(255,255,255,' + (0.15 + R() * 0.5) + ')'; var sz = R() < 0.1 ? 3 : 1.5; g.fillRect(R() * w, R() * h, sz, sz); } }
  if (name === 'jungle') { g.fillStyle = 'rgba(10,50,10,.10)'; for (var l = 0; l < 40; l++) { g.save(); g.translate(R() * w, R() * h); g.rotate(R() * 6.28); g.beginPath(); g.ellipse(0, 0, 50 + R() * 60, 14 + R() * 12, 0, 0, 6.28); g.fill(); g.restore(); } }
  if (name === 'beach') { g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 3; for (var bw2 = 0; bw2 < 40; bw2++) { var by2 = R() * h, bx2 = R() * w; g.beginPath(); g.moveTo(bx2, by2); g.bezierCurveTo(bx2 + 40, by2 - 12, bx2 + 80, by2 + 12, bx2 + 120, by2); g.stroke(); } }
  if (name === 'volcano') { for (var vs = 0; vs < 90; vs++) { g.fillStyle = 'rgba(255,200,255,' + (0.03 + R() * 0.05) + ')'; g.beginPath(); g.arc(R() * w, R() * h, 2 + R() * 5, 0, 6.28); g.fill(); } }
  if (name === 'stadium' || name === 'night') { var sw = w / 10; for (var sb = 0; sb < 10; sb++) { g.fillStyle = sb % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; g.fillRect(sb * sw, 0, sw, h); } }
  if (name === 'ocean') { g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 3; for (var wv = 0; wv < 60; wv++) { var wy = R() * h, wx = R() * w; g.beginPath(); g.moveTo(wx, wy); g.bezierCurveTo(wx + 40, wy - 14, wx + 80, wy + 14, wx + 120, wy); g.stroke(); } }
  var vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.75);
  vg.addColorStop(0, 'rgba(255,255,255,.09)'); vg.addColorStop(1, 'rgba(0,0,0,.28)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 26; g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(-6, -6, w + 12, h + 12); g.restore();
}

// ----- Wood -----
export function woodTexture(base, seed, aniso) {
  var c = cvs(512, 512), g = c.getContext('2d'), R = rng(seed || 3);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (var i = 0; i < 260; i++) {
    var y = R() * 512, a = 0.04 + R() * 0.12, lite = R() < 0.45; g.strokeStyle = lite ? 'rgba(255,225,170,' + a + ')' : 'rgba(30,12,0,' + (a * 1.2) + ')'; g.lineWidth = 0.6 + R() * 2.4;
    g.beginPath(); g.moveTo(0, y); var amp = 2 + R() * 5; for (var x = 0; x <= 512; x += 64) g.lineTo(x, y + Math.sin(x / 90 + i) * amp); g.stroke();
  }
  for (var k = 0; k < 3; k++) { var kx = R() * 512, ky = R() * 512; for (var r = 22; r > 2; r -= 5) { g.strokeStyle = 'rgba(40,18,0,' + (0.05 + (22 - r) * 0.012) + ')'; g.lineWidth = 2; g.beginPath(); g.ellipse(kx, ky, r * 2.2, r * 0.8, 0, 0, 6.28); g.stroke(); } }
  return ctex(c, aniso || 4, [1 / 8, 1 / 8]);
}

// ----- Floors -----
function plankFloor(size, aniso) {
  var c = cvs(1024, 1024), g = c.getContext('2d'), R = rng(21), rows = 8, ph = 1024 / rows;
  for (var r = 0; r < rows; r++) {
    var x = -R() * 400;
    while (x < 1024) {
      var len = 360 + R() * 340, tone = 0.42 + R() * 0.12, col = 'hsl(' + (28 + R() * 6) + ',' + (42 + R() * 10) + '%,' + (tone * 100 * 0.75) + '%)';
      g.fillStyle = col; g.fillRect(x, r * ph, len, ph);
      for (var j = 0; j < 22; j++) { g.strokeStyle = R() < 0.5 ? 'rgba(255,220,170,.07)' : 'rgba(30,12,0,.10)'; g.lineWidth = 1 + R() * 2; var yy = r * ph + R() * ph; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + len, yy + (R() - 0.5) * 6); g.stroke(); }
      g.fillStyle = 'rgba(20,8,0,.55)'; g.fillRect(x, r * ph, 3, ph); x += len;
    }
    g.fillStyle = 'rgba(20,8,0,.6)'; g.fillRect(0, r * ph, 1024, 3);
  }
  var t = ctex(c, aniso, [size / 10, size / 10]);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0 });
}
function rugTexture() {
  var c = cvs(512, 384), g = c.getContext('2d');
  g.fillStyle = '#7a2230'; g.fillRect(0, 0, 512, 384);
  g.strokeStyle = '#f3e3c3'; g.lineWidth = 10; g.strokeRect(22, 22, 468, 340);
  g.strokeStyle = '#d9a441'; g.lineWidth = 5; g.strokeRect(44, 44, 424, 296);
  g.fillStyle = '#2f5d62'; g.fillRect(60, 60, 392, 264);
  g.fillStyle = '#f3e3c3'; for (var x = 0; x < 6; x++) for (var y = 0; y < 4; y++) { var cx = 90 + x * 66, cy = 94 + y * 66; g.beginPath(); g.moveTo(cx, cy - 22); g.lineTo(cx + 22, cy); g.lineTo(cx, cy + 22); g.lineTo(cx - 22, cy); g.closePath(); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; }
  var R = rng(9); for (var i = 0; i < 6000; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'; g.fillRect(R() * 512, R() * 384, 2, 2); }
  return ctex(c, 4);
}
function grassFloor(size, aniso) {
  var c = cvs(512, 512), g = c.getContext('2d'), R = rng(31);
  g.fillStyle = '#2c5a1f'; g.fillRect(0, 0, 512, 512);
  for (var i = 0; i < 9; i++) { var x = R() * 512, y = R() * 512, r = 80 + R() * 120, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(190,230,90,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (var b = 0; b < 4500; b++) { g.strokeStyle = 'hsla(' + (90 + R() * 35) + ',55%,' + (18 + R() * 28) + '%,.55)'; g.lineWidth = 1.2; var bx = R() * 512, by = R() * 512; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (R() - 0.5) * 6, by - 4 - R() * 8); g.stroke(); }
  return new THREE.MeshStandardMaterial({ map: ctex(c, aniso, [size / 14, size / 14]), roughness: 0.95 });
}
function waterFloor(size, aniso) {
  var c = cvs(512, 512), g = c.getContext('2d'), R = rng(41);
  var gr = g.createLinearGradient(0, 0, 512, 512); gr.addColorStop(0, '#1d8bc9'); gr.addColorStop(1, '#136aa6'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (var i = 0; i < 90; i++) { var x = R() * 512, y = R() * 512, w = 40 + R() * 90; g.strokeStyle = 'rgba(210,245,255,' + (0.08 + R() * 0.12) + ')'; g.lineWidth = 2 + R() * 3; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + w * 0.3, y - 16, x + w * 0.7, y + 16, x + w, y); g.stroke(); }
  for (var j = 0; j < 12; j++) { var cx = R() * 512, cy = R() * 512, rr = 30 + R() * 60, cg = g.createRadialGradient(cx, cy, 0, cx, cy, rr); cg.addColorStop(0, 'rgba(255,255,255,.07)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = cg; g.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr); }
  return new THREE.MeshPhysicalMaterial({ map: ctex(c, aniso, [size / 18, size / 18]), roughness: 0.18, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 });
}

// ----- Props (low-poly, flat shaded, no shadows: cheap) -----
function stdm(color, rough, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough == null ? 0.7 : rough, flatShading: true }, extra || {})); }
function place(R, W, D, fn, n, margin, spread) {
  for (var i = 0; i < n; i++) {
    var x, z, tries = 0;
    do { x = (R() * 2 - 1) * (W / 2 + spread); z = (R() * 2 - 1) * (D / 2 + spread); tries++; } while (tries < 40 && Math.abs(x) < W / 2 + margin && Math.abs(z) < D / 2 + margin);
    fn(x, z, i);
  }
}
function add(g, geo, mat, x, y, z) { var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; }

function feltRoomProps(g, W, D, R, aniso) {
  var FY = FLOOR_Y;
  var rug = new THREE.Mesh(new THREE.PlaneGeometry(W + 22, D + 18), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = FY + 0.02; rug.receiveShadow = true; g.add(rug);
  var cols = [0xe8590c, 0x1c7ed6, 0xf59f00, 0xae3ec9];
  place(R, W, D, function (x, z, i) { var c = add(g, new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.9 }), x, FY + 0.55, z); c.scale.set(1.9, 0.55, 1.9); c.rotation.y = R() * 6; }, 4, 3.2, 9);
  place(R, W, D, function (x, z) {
    add(g, new THREE.CylinderGeometry(0.9, 0.65, 1.3, 14), stdm(0xc0643a, 0.8), x, FY + 0.65, z);
    for (var k = 0; k < 7; k++) { var l = add(g, new THREE.ConeGeometry(0.28, 2.2 + R() * 0.8, 6), stdm(0x2f9e44, 0.7), x + (R() - 0.5) * 0.5, FY + 2.1, z + (R() - 0.5) * 0.5); l.rotation.set((R() - 0.5) * 0.9, 0, (R() - 0.5) * 0.9); }
  }, 2, 3.5, 8);
  place(R, W, D, function (x, z) {
    var bc = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xfcc419];
    for (var k = 0; k < 3; k++) { var b = add(g, new THREE.BoxGeometry(1.3, 1.3, 1.3), stdm(bc[(k + Math.floor(R() * 4)) % 4], 0.5), x + (k === 2 ? 0.65 : k * 1.4), FY + 0.65 + (k === 2 ? 1.3 : 0), z); b.rotation.y = (R() - 0.5) * 0.5; }
  }, 2, 3.4, 8);
  // standing lamp with a warm glow
  var lx = W / 2 + 6.5, lz = -D / 2 - 1;
  add(g, new THREE.CylinderGeometry(0.12, 0.12, 9, 8), stdm(0x333333, 0.4), lx, FY + 4.5, lz);
  add(g, new THREE.CylinderGeometry(0.9, 0.9, 0.2, 14), stdm(0x333333, 0.4), lx, FY + 0.1, lz);
  add(g, new THREE.CylinderGeometry(0.9, 1.5, 1.6, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffc870, emissiveIntensity: 0.9, side: THREE.DoubleSide }), lx, FY + 9.4, lz);
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: 0xffc870, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glow.scale.set(11, 11, 1); glow.position.set(lx, FY + 9, lz); g.add(glow);
}
function jungleProps(g, W, D, R) {
  var FY = FLOOR_Y, greens = [0x1f6b2a, 0x2b8a3e, 0x37a24a, 0x14532d];
  place(R, W, D, function (x, z) {
    var h = 6 + R() * 5; add(g, new THREE.CylinderGeometry(0.5, 0.8, h, 7), stdm(0x5a3b1e, 0.9), x, FY + h / 2, z);
    for (var k = 0; k < 3; k++) { var s = 2.6 - k * 0.5 + R() * 0.6, c = add(g, new THREE.IcosahedronGeometry(s, 1), stdm(greens[Math.floor(R() * 4)], 0.8), x + (R() - 0.5), FY + h + k * 1.3 - 0.5, z + (R() - 0.5)); c.scale.y = 0.8; }
  }, 9, 3.4, 12);
  place(R, W, D, function (x, z) { var s = 0.9 + R() * 1.2, b = add(g, new THREE.IcosahedronGeometry(s, 1), stdm(greens[Math.floor(R() * 4)], 0.8), x, FY + s * 0.5, z); b.scale.y = 0.7; }, 16, 2.6, 10);
  place(R, W, D, function (x, z) {
    var s = 0.6 + R() * 0.5; add(g, new THREE.CylinderGeometry(0.18 * s, 0.24 * s, 1.2 * s, 8), stdm(0xf1e6c9, 0.7), x, FY + 0.6 * s, z);
    var cap = add(g, new THREE.SphereGeometry(0.8 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), stdm(0xe03131, 0.5), x, FY + 1.2 * s, z); cap.scale.y = 0.8;
  }, 9, 2.6, 9);
  var sm = new THREE.SpriteMaterial({ map: softTexture(), color: 0xf4ff8a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  place(R, W, D, function (x, z) { var f = new THREE.Sprite(sm); f.scale.set(0.5, 0.5, 1); f.position.set(x, FY + 3 + R() * 6, z); g.add(f); }, 14, 1.5, 10);
}
function oceanProps(g, W, D, R) {
  var FY = FLOOR_Y, rc = [0xff6b6b, 0xffd43b, 0x4dabf7, 0xff922b];
  place(R, W, D, function (x, z, i) { var t = add(g, new THREE.TorusGeometry(1.1, 0.42, 10, 24), stdm(rc[i % 4], 0.4, { flatShading: false }), x, FY + 0.15, z); t.rotation.x = Math.PI / 2; }, 6, 3.2, 10);
  place(R, W, D, function (x, z) { var s = 1.2 + R() * 1.6, r = add(g, new THREE.DodecahedronGeometry(s, 0), stdm(0x6b7280, 0.9), x, FY + s * 0.2, z); r.scale.y = 0.65; r.rotation.y = R() * 6; }, 6, 3.4, 12);
  place(R, W, D, function (x, z) {
    add(g, new THREE.CylinderGeometry(0.6, 0.8, 1.6, 12), stdm(0xe03131, 0.5, { flatShading: false }), x, FY + 0.8, z);
    add(g, new THREE.CylinderGeometry(0.62, 0.62, 0.4, 12), stdm(0xffffff, 0.5, { flatShading: false }), x, FY + 1.1, z);
    add(g, new THREE.SphereGeometry(0.35, 10, 8), stdm(0xfff3bf, 0.3, { flatShading: false, emissive: 0xffd43b, emissiveIntensity: 0.6 }), x, FY + 2, z);
  }, 3, 4, 11);
  var sand = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshStandardMaterial({ color: 0xf2dca6, roughness: 1 })); sand.rotation.x = -Math.PI / 2; sand.position.set(-W / 2 - 34, FY + 0.05, -D / 2 - 34); g.add(sand);
}
function spaceScene(g, W, D, R) {
  var n = 2200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tint = [[1, 1, 1], [0.7, 0.8, 1], [1, 0.8, 0.9], [1, 0.95, 0.7]];
  for (var i = 0; i < n; i++) {
    var u = R() * 2 - 1, a = R() * 6.2832, r = 70 + R() * 50, s = Math.sqrt(1 - u * u), t = tint[Math.floor(R() * 4)], b = 0.4 + R() * 0.6;
    pos[i * 3] = r * s * Math.cos(a); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(a);
    col[i * 3] = t[0] * b; col[i * 3 + 1] = t[1] * b; col[i * 3 + 2] = t[2] * b;
  }
  var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  var stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.55, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, fog: false })); g.add(stars);
  [[0x7048e8, -40, -50, -60, 90], [0x1c9fd6, 55, -35, -50, 80], [0xd6336c, 20, -70, 20, 70], [0x4263eb, -60, -30, 30, 70]].forEach(function (nb) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: nb[0], transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.scale.set(nb[4], nb[4], 1); sp.position.set(nb[1], nb[2], nb[3]); g.add(sp);
  });
  var planet = add(g, new THREE.SphereGeometry(8, 40, 24), new THREE.MeshStandardMaterial({ color: 0xd9825b, roughness: 0.85 }), 58, -62, -62);
  var ring = add(g, new THREE.RingGeometry(11, 16, 64), new THREE.MeshBasicMaterial({ color: 0xe8c9a0, transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false }), 58, -62, -62); ring.rotation.x = -Math.PI / 2 + 0.35; ring.rotation.y = 0.2;
  var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: 0x5cd6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(W * 2.2, D * 2.2, 1); halo.position.set(0, FLOOR_Y + 2.5, 0); g.add(halo);
  var under = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.9, D * 1.9), new THREE.MeshBasicMaterial({ map: softTexture(), color: 0x38bdf8, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); under.rotation.x = -Math.PI / 2; under.position.y = -2.2; g.add(under);
}

// Builds the world around the table for a theme. Returns { group, legs }.
// The full venues (night, beach, volcano) also return the stadium-style effect API:
// { setBoard(text), wave(), flash(), step(now), dispose(), key (their main DirectionalLight) }.
// layoutName and quality are optional (guessed from W/D, and full quality) so older callers keep working.
export function buildEnvironment(name, W, D, aniso, layoutName, quality) {
  var lay = layoutName || (W < D ? 'tall' : 'wide'), q = quality || function () { return 2; };
  if (name === 'night') return buildStadium(W, D, aniso, lay, q, { night: true });
  if (name === 'beach') return buildBeach(W, D, aniso, lay, q, FLOOR_Y);
  if (name === 'volcano') return buildVolcano(W, D, aniso, lay, q, FLOOR_Y);
  var g = new THREE.Group(), T = THEMES[name] || THEMES.felt, R = rng(name.length * 7919 + 13), size = 150;
  if (name === 'space') { spaceScene(g, W, D, R); return { group: g, legs: false }; }
  var mat = name === 'jungle' ? grassFloor(size, aniso) : name === 'ocean' ? waterFloor(size, aniso) : plankFloor(size, aniso);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true; g.add(floor);
  if (name === 'jungle') jungleProps(g, W, D, R); else if (name === 'ocean') oceanProps(g, W, D, R); else feltRoomProps(g, W, D, R, aniso);
  return { group: g, legs: T.legs };
}
export { hexCss, shade };
