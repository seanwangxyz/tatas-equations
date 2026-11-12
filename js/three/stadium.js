// Stadium theme: the table sits on a striped pitch in a stylised soccer ground that GROWS with the player's progress
// (5 tiers, see weather.js for the rule) and has a time of day and a weather per match (weather.js).
//   tier 1 a small ground: one low stand per side, a few hundred fans, lamp posts, a small scoreboard, trees beyond
//   tier 2 a club ground: bigger stands, more fans, floodlight poles, a medium scoreboard
//   tier 3 a town stadium: big stands, floodlight towers, the big scoreboard, dugouts in the side stands
//   tier 4 a big stadium (about the old one): taller towers, the players' tunnel, flags in the kit colours on the stands
//   tier 5 an arena: two-tier stands closed round the corners, a roof ring, four very tall towers, a giant screen,
//          kit-colour banners on the upper tier, kit corner flags
//   every tier: trophy banners (cups won, crowns) draped over the front of the back stand
// Raked stands with an instanced crowd of toy-figure fans on little seats (crowd.js), goals with nets, corner flags,
// ad boards. All static: nothing here animates at rest. The crowd reactions and camera flashbulbs are one-shot effects
// driven by step(); they finish and stop asking for frames. Rain and snow (weather.js) are the one exception: while
// they fall, step() asks for a frame at a capped low rate (never on 'Fast' quality or with S.set.weather === false).
import * as THREE from 'three';
import { FLOOR_Y, softTexture } from './environment.js';
import { keyLight, mergeGeos, mtx } from './arenas/common.js';
import { makeBlockCrowd } from './crowd.js';
import { stadiumTier, currentWeather, lookFor, applyLook, buildSig, noteBuilt, skyDome, rainbow, makeParticles, mistBanks } from './weather.js';

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function cvs(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(cv, aniso, rep) {
  var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso || 1;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}

var PITCH = 100, PPU = 20.48; // pitch plane size in units, canvas pixels per unit

// o.cols (optional): [stripe A, stripe B, trackside] for other venues; o.size: canvas size (default 2048)
export function pitchTexture(aniso, o) {
  var S = o.size || 2048, c = cvs(S, S), g = c.getContext('2d'), R = rng(77), k = S / PITCH, cols = o.cols || ['#2f8a36', '#277a2d', '#25422a'];
  var band = 3.6, z0 = o.lineZ - 40; // stripes run parallel to the touchline
  for (var i = 0; i < 40; i++) { var z = z0 + i * band; g.fillStyle = i % 2 ? cols[0] : cols[1]; g.fillRect(0, (z + 50) * k, S, band * k + 1); }
  for (var n = 0; n < 9000; n++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(R() * S, R() * S, 2, 2); }
  // everything behind the touchline is plain trackside
  g.fillStyle = cols[2]; g.fillRect(0, 0, S, (o.lineZ + 50) * k);
  g.strokeStyle = 'rgba(255,255,255,.88)'; g.lineWidth = 0.22 * k; g.lineCap = 'butt';
  var X = function (x) { return (x + 50) * k; }, Z = function (z) { return (z + 50) * k; };
  g.beginPath(); g.moveTo(X(-o.gx), Z(o.lineZ)); g.lineTo(X(o.gx), Z(o.lineZ)); g.stroke(); // touchline
  if (o.goals) {
    g.beginPath(); g.moveTo(X(-o.gx), Z(o.lineZ)); g.lineTo(X(-o.gx), Z(o.lineZ + 40)); g.moveTo(X(o.gx), Z(o.lineZ)); g.lineTo(X(o.gx), Z(o.lineZ + 40)); g.stroke(); // goal lines
    [-1, 1].forEach(function (s) { // goal area and penalty box
      g.strokeRect(s < 0 ? X(-o.gx) : X(o.gx - 3.2), Z(o.goalZ - 4.2), 3.2 * k, 8.4 * k);
      g.strokeRect(s < 0 ? X(-o.gx) : X(o.gx - 7), Z(o.goalZ - 7.5), 7 * k, 15 * k);
    });
    g.beginPath(); g.arc(X(0), Z(o.goalZ + 14), 5 * k, 0, 6.2832); g.stroke(); // centre circle (partly under the table)
  }
  // corner arcs at the two back corners
  [[-o.gx, 0], [o.gx, 1]].forEach(function (p) { g.beginPath(); g.arc(X(p[0]), Z(o.lineZ), 1.1 * k, p[1] ? Math.PI * 0.5 : 0, p[1] ? Math.PI : Math.PI * 0.5); g.stroke(); });
  return ctex(c, aniso);
}

function adTexture(aniso) {
  var c = cvs(2048, 64), g = c.getContext('2d'), words = ['TATA', 'MATH', 'GOAL!', 'EQUATIONS', 'SOCCER', 'MATH', 'TATA', 'GOAL!'], cols = ['#e03131', '#1c7ed6', '#f08c00', '#2f9e44', '#7048e8', '#1c7ed6', '#e03131', '#f08c00'];
  for (var i = 0; i < 8; i++) {
    g.fillStyle = cols[i]; g.fillRect(i * 256, 0, 256, 64); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(i * 256, 0, 256, 8);
    g.font = '900 40px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(words[i], i * 256 + 128, 35);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * 256, 0, 3, 64);
  }
  return ctex(c, aniso);
}
function netTexture() {
  var c = cvs(128, 128), g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
  for (var i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  var t = ctex(c, 4, [1, 1]); t.anisotropy = 4; return t;
}
function flashTexture() {
  var c = cvs(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(31, 4, 2, 56); g.fillRect(4, 31, 56, 2);
  return ctex(c, 1);
}
// snow lying on the grass: soft white patches, thicker toward the stands (repeated over the pitch plane)
function snowTexture() {
  var c = cvs(256, 256), g = c.getContext('2d'), R = rng(311);
  for (var i = 0; i < 260; i++) {
    var x = R() * 256, y = R() * 256, r = 4 + R() * 22, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,' + (0.35 + R() * 0.4) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; [[0, 0], [-256, 0], [256, 0], [0, -256], [0, 256]].forEach(function (o) { g.fillRect(x - r + o[0], y - r + o[1], 2 * r, 2 * r); });
  }
  for (var k = 0; k < 2500; k++) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(R() * 256, R() * 256, 1.5, 1.5); }
  return ctex(c, 4, [14, 14]);
}

// Night: floodlit pool of light on the pitch, brightest round the table, fading toward the stands
function lightPool() {
  var c = cvs(128, 128), g = c.getContext('2d');
  g.fillStyle = '#05070c'; g.fillRect(0, 0, 128, 128);
  var gr = g.createRadialGradient(64, 66, 4, 64, 66, 30); // 100-unit plane: 30px is about 23 units
  gr.addColorStop(0, '#e8efff'); gr.addColorStop(0.55, '#8e9bb8'); gr.addColorStop(1, 'rgba(5,7,12,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function stdm(color, rough, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough == null ? 0.8 : rough, flatShading: true }, extra || {})); }

// Draws text on the big scoreboard
function paintBoard(cv, text, frame) {
  var g = cv.getContext('2d'), w = cv.width, h = cv.height;
  var bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0b1a45'); bg.addColorStop(1, '#050b24'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.035)'; for (var y = 0; y < h; y += 6) g.fillRect(0, y, w, 2); // LED rows
  var hb = Math.round(h * 0.17); g.fillStyle = '#12306e'; g.fillRect(0, 0, w, hb);
  g.font = '800 ' + Math.round(hb * 0.55) + 'px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#8fd3ff'; g.fillText("⚽  TATA'S EQUATIONS  ⚽", w / 2, hb / 2 + 2);
  var lines = String(text == null || text === '' ? 'LET’S PLAY!' : text).split('\n').slice(0, 3), avail = h - hb - 24, lh, size = Math.min(210, Math.floor(avail / lines.length / 1.05));
  g.textBaseline = 'middle';
  for (;;) {
    g.font = '900 ' + size + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    var mx = 0; lines.forEach(function (l) { mx = Math.max(mx, g.measureText(l).width); });
    if (mx < w - 110 || size < 26) break; size -= 6;
  }
  lh = size * 1.05; var top = hb + (h - hb) / 2 - (lines.length - 1) * lh / 2;
  g.shadowColor = '#ffb000'; g.shadowBlur = 22; g.fillStyle = '#ffd43b';
  lines.forEach(function (l, i) { g.fillText(l, w / 2, top + i * lh); });
  g.shadowBlur = 0; g.strokeStyle = frame || '#2b4a9a'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
}

// ----- the player's kit colours, cups and crowns (read from the saved progress) -----
function kitCols() {
  var k = (window.S && window.S.kit) || {}, ok = function (c, d) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d; };
  return { shirt: ok(k.shirt, '#c9342c'), trim: ok(k.trim, '#2f8f7c') };
}
var CUP_NAMES = { kickoff: 'KICK-OFF CUP', creature: 'CREATURE CUP', monster: 'MONSTER CUP', champions: 'CHAMPIONS CUP' };
var CUP_COLS = { kickoff: '#2f9e44', creature: '#1c7ed6', monster: '#7048e8', champions: '#e8a800' };
function trophies() {
  var S = window.S || {}, out = [], won = (S.cups && S.cups.won) || {};
  ['kickoff', 'creature', 'monster', 'champions'].concat(Object.keys(won).filter(function (k) { return !CUP_NAMES[k]; })).forEach(function (id) {
    var n = +won[id] || 0; if (n > 0) out.push({ icon: '🏆', text: CUP_NAMES[id] || String(id).toUpperCase(), n: n, col: CUP_COLS[id] || '#c92a2a' });
  });
  var crowns = S.trios ? Object.keys(S.trios).filter(function (k) { return S.trios[k]; }).length : 0;
  if (crowns) out.push({ icon: '👑', text: crowns === 1 ? 'TRIO CROWN' : crowns + ' TRIO CROWNS', n: 1, col: '#d6336c' });
  return out;
}
function bannerTexture(t, kit) {
  var c = cvs(512, 256), g = c.getContext('2d');
  g.fillStyle = t.col; g.fillRect(0, 0, 512, 256);
  g.fillStyle = kit.trim; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22);
  g.fillStyle = 'rgba(255,255,255,.14)'; for (var x = -256; x < 512; x += 48) { g.beginPath(); g.moveTo(x, 22); g.lineTo(x + 24, 22); g.lineTo(x + 24 + 212, 234); g.lineTo(x + 212, 234); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '110px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; g.fillText(t.icon, 92, 132);
  var label = t.text + (t.n > 1 ? ' x' + t.n : ''), size = 64;
  do { g.font = '900 ' + size + 'px "Trebuchet MS", sans-serif'; size -= 4; } while (g.measureText(label).width > 340 && size > 20);
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeText(label, 330, 134); g.fillStyle = '#fff'; g.fillText(label, 330, 134);
  return ctex(c, 4);
}
function fasciaTexture(kit) {
  var c = cvs(1024, 96), g = c.getContext('2d'), name = String((window.S && window.S.name) || '').toUpperCase().slice(0, 14);
  var words = [name ? '★ HOME OF ' + name + ' ★' : '★ HOME OF THE CHAMPION ★', "★ TATA'S EQUATIONS ★"];
  for (var i = 0; i < 2; i++) {
    g.fillStyle = i ? kit.trim : kit.shirt; g.fillRect(i * 512, 0, 512, 96);
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(i * 512, 0, 512, 6); g.fillRect(i * 512, 90, 512, 6);
    var size = 52; do { g.font = '900 ' + size + 'px "Trebuchet MS", sans-serif'; size -= 4; } while (g.measureText(words[i]).width > 470 && size > 20);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(words[i], i * 512 + 256, 50);
  }
  return ctex(c, 4);
}

// Per tier: [wide, tall]. b / s: rows of the back / side stands (the lower tier at tier 5), up: upper tier rows,
// fill: share of seats taken, back: extra back-stand length beyond the table, sideEnd: how far the side stands come forward.
var TIERS = {
  1: { b: [4, 3], s: [3, 3], fill: 0.62, back: [12, 6], sideEnd: [1.5, 1.5], lights: 'post', lightH: 7, board: [[4.6, 2.0], [3.6, 1.7]], ads: 'short', trees: true },
  2: { b: [6, 5], s: [5, 4], fill: 0.78, back: [22, 12], sideEnd: [4, 3], lights: 'pole', lightH: 10.5, board: [[7.2, 2.7], [4.6, 2.1]], ads: 'full', trees: true },
  3: { b: [8, 6], s: [7, 6], fill: 0.9, back: [30, 16], sideEnd: [7, 5], lights: 'tower', lightH: 13, board: [[10.5, 3.4], [5.6, 2.5]], ads: 'full', dugouts: true },
  4: { b: [9, 8], s: [9, 8], fill: 0.95, back: [30, 16], sideEnd: [7, 5], lights: 'tower', lightH: 15, board: [[10.5, 3.4], [5.6, 2.5]], ads: 'full', dugouts: true, tunnel: true, flags: true },
  5: { b: [6, 5], s: [6, 5], up: [6, 5], fill: 1, back: [0, 0], sideEnd: [7, 5], lights: 'mega', lightH: 23, board: [[12.6, 4.0], [6.4, 2.9]], ads: 'full', dugouts: true, tunnel: true, flags: true, roof: true, banners: true, kitCorners: true, closed: true }
};
// tier 5 people budget by quality level (low, medium, high): about the old stadium's triangles (the high level
// uses the medium figure detail there, ~17% fewer triangles per person, so more people fit)
var T5_PEOPLE = [[775, 975, 1380], [585, 750, 1070]]; // [wide, tall] x [low, medium, high]

// opts.night: the night venue (always under floodlights). Otherwise the time of day and weather come from weather.js.
export function buildStadium(W, D, aniso, layoutName, quality, opts) {
  var g = new THREE.Group(), R = rng(2024), tall = layoutName === 'tall', ti = tall ? 1 : 0, FY = FLOOR_Y;
  var mat = opts && opts.night ? 'night' : 'stadium', w = currentWeather(), tier = stadiumTier(), TC = TIERS[tier];
  applyLook(w, mat); noteBuilt(buildSig(mat, w, tier));
  var L = lookFor(w, mat), night = L.time === 'night', dusk = L.time === 'dusk', wet = w.sky === 'rain', snow = w.sky === 'snow', kit = kitCols();
  var rowD = 1.15, rise = 0.6, rowsB = TC.b[ti], rowsS = TC.s[ti], rowsU = TC.up ? TC.up[ti] : 0, rowDU = 1.05, riseU = 0.72, gapU = 1.6;
  var lineZ = -D / 2 - (tall ? 2.0 : 3.4);
  var sideGap = tall ? 2.5 : 8.2, standX = W / 2 + sideGap;
  var gx = standX - (tall ? 0.6 : 1.2), goals = !tall, goalZ = -1.5;
  var z0 = lineZ - 2.4; // where the back stand starts
  var depthS = rowsS * rowD + rowsU * rowDU, depthB = rowsB * rowD + rowsU * rowDU; // how deep the stands are (both tiers)
  var topS = rowsU ? rowsS * rise + gapU + rowsU * riseU : rowsS * rise, topB = rowsU ? rowsB * rise + gapU + rowsU * riseU : rowsB * rise;
  var backL = TC.closed ? 2 * (standX + depthS) : W + TC.back[ti];
  var sideZ0 = z0 + (TC.closed ? 0 : 1), sideZ1 = D / 2 + TC.sideEnd[ti];

  // ----- ground, pitch -----
  var floorCol = snow ? (L.dark ? 0x5c6676 : 0xdfe6ee) : night ? 0x0d2614 : wet ? 0x173f1e : 0x1d4d25;
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: floorCol, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = FY - 0.04; g.add(floor);
  var pitchMap = pitchTexture(aniso, { lineZ: lineZ, gx: gx, goals: goals, goalZ: goalZ });
  // at night the pitch glows a little by itself (the floodlights), so it reads brighter than the stands. Rain: a wet
  // sheen (lower roughness picks up the sky reflections). Snow: a white dusting on top.
  var pm = night ? { map: pitchMap, color: 0x3c3c40, lightMap: lightPool(), lightMapIntensity: 7, roughness: 0.95 } : { map: pitchMap, roughness: 0.95 };
  if (wet) { pm.roughness = 0.42; pm.envMapIntensity = 1.5; pm.color = night ? 0x34363c : 0xb4c2b4; }
  var pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH, PITCH), new THREE.MeshStandardMaterial(pm));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = FY; pitch.receiveShadow = true; g.add(pitch);
  if (snow) {
    var sn = new THREE.Mesh(new THREE.PlaneGeometry(PITCH, PITCH), new THREE.MeshStandardMaterial({ map: snowTexture(), color: 0xffffff, transparent: true, opacity: 0.75, roughness: 1, depthWrite: false }));
    sn.rotation.x = -Math.PI / 2; sn.position.y = FY + 0.015; sn.renderOrder = 1; g.add(sn);
  }
  g.add(skyDome(L));
  if (w.rainbow && !night) g.add(rainbow(FY, z0 - depthB));

  // ----- Stands (each stand is a group: local +x points away from the pitch, +z runs along the stand) -----
  var concreteCol = snow ? (L.dark ? 0x6d7686 : 0xc9d2de) : night ? 0x3a4152 : wet ? 0x5f6878 : 0x7d8798;
  var concrete = stdm(concreteCol, wet ? 0.55 : 0.9), seats = [], stands = [];
  function profileOf(rows, rD, rs, u0, y0) {
    var p = new THREE.Shape();
    if (!u0) { p.moveTo(0, 0); for (var i = 0; i < rows; i++) { p.lineTo(i * rD, (i + 1) * rs); p.lineTo((i + 1) * rD, (i + 1) * rs); } p.lineTo(rows * rD, 0); p.lineTo(0, 0); }
    else { p.moveTo(u0, 0); p.lineTo(u0, y0); for (var j = 0; j < rows; j++) { p.lineTo(u0 + j * rD, y0 + (j + 1) * rs); p.lineTo(u0 + (j + 1) * rD, y0 + (j + 1) * rs); } p.lineTo(u0 + rows * rD, 0); p.lineTo(u0, 0); }
    return p;
  }
  function stand(theta, px, pz, len, team, rows) {
    var sg = new THREE.Group(); sg.rotation.y = theta; sg.position.set(px, FY, pz); g.add(sg); sg.updateMatrix();
    var st = { g: sg, len: len, team: team, rows: rows, depth: rows * rowD + rowsU * rowDU, top: rowsU ? rows * rise + gapU + rowsU * riseU : rows * rise, lowTop: rows * rise, u0: rows * rowD, y0: rows * rise + gapU };
    sg.add(new THREE.Mesh(new THREE.ExtrudeGeometry(profileOf(rows, rowD, rise), { depth: len, bevelEnabled: false }), concrete));
    var seatRy = Math.atan2(-Math.cos(theta), Math.sin(theta));
    seats.push({ m: sg.matrix.clone(), len: len, team: team, seatRy: seatRy, rows: rows, rD: rowD, rs: rise, u0: 0, y0: 0 });
    if (rowsU) {
      sg.add(new THREE.Mesh(new THREE.ExtrudeGeometry(profileOf(rowsU, rowDU, riseU, st.u0, st.y0), { depth: len, bevelEnabled: false }), concrete));
      seats.push({ m: sg.matrix.clone(), len: len, team: team, seatRy: seatRy, rows: rowsU, rD: rowDU, rs: riseU, u0: st.u0, y0: st.y0, upper: true });
    }
    stands.push(st); return st;
  }
  var back = stand(Math.PI / 2, -backL / 2, z0, backL, 'back', rowsB);
  var left = stand(Math.PI, -standX, sideZ1, sideZ1 - sideZ0, 'left', rowsS);
  var right = stand(0, standX, sideZ0, sideZ1 - sideZ0, 'right', rowsS);

  // places on the stands where nobody sits (scoreboard, tunnel, dugouts, banners): world boxes
  var holes = [];
  function hole(x0, x1, za, zb, y1) { holes.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(za, zb), Math.max(za, zb), y1]); }

  // ----- Scoreboard (jumbotron), in a gap in the back stand -----
  var boardW = TC.board[ti][0], boardH = TC.board[ti][1], boardX = tall ? -6.0 : 9.4;
  var bx0 = boardX - boardW / 2 - 0.3, bx1 = boardX + boardW / 2 + 0.3, bzA = z0 - 1.0 * rowD, boardY0 = FY + (tier <= 1 ? 0.9 : 1.2);
  hole(bx0, bx1, -1e3, bzA - 0.2, boardY0 + boardH + 0.4);
  var frameCol = tier >= 5 ? kit.trim : '#2b4a9a';
  var bcv = cvs(1024, Math.round(1024 * boardH / boardW)), btex = ctex(bcv, aniso); paintBoard(bcv, '', frameCol);
  var board = new THREE.Group(); board.position.set(boardX, boardY0 + boardH / 2, bzA); board.rotation.x = -0.32; g.add(board);
  var casing = new THREE.Mesh(new THREE.BoxGeometry(boardW + 0.7, boardH + 0.7, 0.5), stdm(tier >= 5 ? new THREE.Color(kit.shirt).multiplyScalar(0.55).getHex() : 0x1b2233, 0.5, { flatShading: false })); casing.position.z = -0.3; board.add(casing);
  var screen = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), new THREE.MeshBasicMaterial({ map: btex, toneMapped: false, fog: false })); screen.position.z = 0.0; screen.userData.board = true; board.add(screen);
  var glowB = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: 0x4aa8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glowB.scale.set(boardW * 1.5, boardH * 1.7, 1); glowB.position.z = 0.2; board.add(glowB);
  [-1, 1].forEach(function (s) { var pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5), stdm(0x2a3144, 0.6)); pole.position.set(s * boardW * 0.38, -boardH / 2 - 1.2, -0.5); pole.rotation.x = 0.32; board.add(pole); });
  if (tier >= 5) [-1, 1].forEach(function (s) { // speaker stacks either side of the giant screen
    var sp = new THREE.Mesh(new THREE.BoxGeometry(0.9, boardH * 0.8, 0.7), stdm(0x22262e, 0.6)); sp.position.set(s * (boardW / 2 + 0.95), 0, -0.25); board.add(sp);
  });

  // ----- Players' tunnel (tier 4+): a framed opening in the front of the back stand -----
  var tunnelX = tall ? 3.6 : -9.4;
  if (TC.tunnel) {
    hole(tunnelX - 2.1, tunnelX + 2.1, z0 - 2.6, z0 + 2, FY + 2.6);
    var tg = new THREE.Group(); tg.position.set(tunnelX, FY, z0 - 0.35); g.add(tg);
    var frameM = stdm(new THREE.Color(kit.trim).getHex(), 0.6), darkM = new THREE.MeshBasicMaterial({ color: 0x07080b }), roofM = stdm(new THREE.Color(kit.shirt).getHex(), 0.5);
    [[-1.55, 1.1, 0.3, 2.2, 1.6], [1.55, 1.1, 0.3, 2.2, 1.6]].forEach(function (b) { var m = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], b[4]), frameM); m.position.set(b[0], b[1], 0.1); tg.add(m); });
    var lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.35, 1.6), frameM); lintel.position.set(0, 2.3, 0.1); tg.add(lintel);
    var hole3 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.1, 1.3), darkM); hole3.position.set(0, 1.05, -0.2); tg.add(hole3);
    var canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 1.3, 14, 1, true, -Math.PI / 2, Math.PI), roofM); canopy.material.side = THREE.DoubleSide;
    canopy.rotation.x = -Math.PI / 2; canopy.position.set(0, 0.05, 0.95); canopy.scale.set(1, 1, 1.45); tg.add(canopy); // an arch over the way out
    // (the canopy's half cylinder is opaque, so the look-around camera stops in front of it like any other structure)
  }

  // ----- Dugouts (tier 3+): little shelters set into the front of each side stand, near the back (one merged mesh) -----
  if (TC.dugouts) {
    var dgParts = [];
    [left, right].forEach(function (st, si) {
      var s = si ? 1 : -1, zc = sideZ0 + (tall ? 2.6 : 3.2), len = tall ? 2.6 : 3.4, nSeat = tall ? 3 : 4;
      hole(s * (standX - 1.5), s * (standX + 2.45), zc - len / 2 - 0.4, zc + len / 2 + 0.4, FY + 2.0);
      var M = mtx(s * standX, FY, zc, 0, si ? 0 : Math.PI, 0); // local +x away from the pitch
      function box(w2, h2, d2, x, y, z, col, rz) { dgParts.push({ geo: new THREE.BoxGeometry(w2, h2, d2), color: col, m: M.clone().multiply(mtx(x, y, z, 0, 0, rz || 0)) }); }
      box(0.25, 1.6, len, 0.95, 0.8, 0, 0x2b313c);
      box(1.95, 1.6, 0.18, 0, 0.8, -len / 2, 0x2b313c); box(1.95, 1.6, 0.18, 0, 0.8, len / 2, 0x2b313c);
      box(2.3, 0.16, len + 0.3, -0.1, 1.68, 0, snow ? 0xf4f7fb : 0x6f8399, 0.12);
      for (var k = 0; k < nSeat; k++) box(0.5, 0.5, 0.55, 0.45, 0.3, -len / 2 + 0.55 + k * (len - 1.1) / (nSeat - 1), new THREE.Color(si ? kit.trim : kit.shirt).getHex());
    });
    g.add(new THREE.Mesh(mergeGeos(dgParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true })));
  }

  // ----- Trophy banners draped over the front rows of the back stand (one per cup won, one for the crowns) -----
  var tro = trophies(), bannerW = tall ? 2.6 : 3.2;
  if (tro.length) {
    var slots = [], half = backL / 2 - bannerW / 2 - 0.6;
    for (var sx = -half; sx <= half + 1e-6; sx += bannerW + 0.5) {
      var lo = sx - bannerW / 2 - 0.2, hi = sx + bannerW / 2 + 0.2;
      if (hi > bx0 && lo < bx1) continue; if (TC.tunnel && hi > tunnelX - 2.0 && lo < tunnelX + 2.0) continue;
      slots.push(sx);
    }
    slots.sort(function (a, b) { return Math.abs(a) - Math.abs(b); });
    var slope = Math.atan2(rise, rowD);
    tro.slice(0, slots.length).forEach(function (t, i) {
      var x = slots[i], bm = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, 1.6 * bannerW / 3.2 * 1.25), new THREE.MeshStandardMaterial({ map: bannerTexture(t, kit), roughness: 0.85, side: THREE.DoubleSide }));
      // lying on rows 0-1, facing the pitch and up the slope
      bm.position.set(x, FY + rise * 2 + 0.1, z0 - rowD * 1.0); // resting on the front edges of the steps bm.rotation.set(-(Math.PI / 2 - slope), 0, 0); g.add(bm);
      hole(x - bannerW / 2 - 0.25, x + bannerW / 2 + 0.25, z0 - rowD * 2.2, z0 + 0.5, FY + rise * 3);
    });
  }

  // ----- Crowd: toy-figure fans on little seats (js/three/crowd.js), facing the table -----
  // team 0 (red) has the left stand and the left half of the back stand, team 1 (blue) the rest; a few
  // fans sit with the other side. The crowd module dresses everyone (shirts, hair, hats, faces, scarves...).
  var pts = [], v = new THREE.Vector3();
  seats.forEach(function (s) {
    for (var r = 0; r < s.rows; r++) {
      if (s.upper && TC.roof && r >= s.rows - 1) continue; // the last upper row is under the roof
      var step = 0.62, cnt = Math.floor((s.len - 1.2) / step);
      for (var k = 0; k < cnt; k++) {
        if (R() >= Math.min(TC.fill, 0.95)) continue; // empty seats (the old stadium: 5%)
        var u = s.u0 + r * s.rD + s.rD * 0.55 + (R() - 0.5) * 0.08, sv = 0.6 + k * step + (R() - 0.5) * 0.08, y = s.y0 + (r + 1) * s.rs;
        v.set(u, y, sv).applyMatrix4(s.m);
        var lft = s.team === 'left' ? true : s.team === 'right' ? false : v.x < 0;
        if (R() < 0.12) lft = !lft;
        // people turn toward the table; their seats stay square to the stand
        pts.push({ x: v.x, y: v.y, z: v.z, ry: Math.atan2(-v.x, -v.z), seatRy: s.seatRy, team: lft ? 0 : 1 });
      }
    }
  });
  pts = pts.filter(function (p) { for (var h = 0; h < holes.length; h++) { var b = holes[h]; if (p.x > b[0] && p.x < b[1] && p.z > b[2] && p.z < b[3] && p.y < b[4]) return false; } return true; });
  // tier 5: keep the arena inside the old stadium's triangle budget (people spread evenly: a few empty seats)
  var q0 = quality(), crowdQ = quality;
  if (tier >= 5) {
    var lv = q0 >= 2 ? 2 : q0 >= 1 ? 1 : 0, keep = lv === 0 ? 2 / 3 : 5 / 6, want = Math.round(T5_PEOPLE[ti][lv] / keep);
    if (lv === 2) crowdQ = function () { return Math.min(1, quality()); }; // the medium figure detail on high
    if (pts.length > want) { var RR = rng(55), f = want / pts.length; pts = pts.filter(function () { return RR() < f; }); }
  }
  pts.forEach(function (p) { var th = Math.atan2(p.x, -(p.z - D / 2)); p.key = (th + 1.75) / 3.5; }); // 0..1 from the left side, round the back, to the right
  var crowd = makeBlockCrowd(g, pts, { quality: crowdQ, dim: L.dim, style: 'fans', seed: 2024 });
  pts = crowd.pts; var N = pts.length;

  // ----- Ad boards along the touchline, trackside -----
  var adT = adTexture(aniso), adLen = TC.ads === 'short' ? Math.min(W + 6, backL - 4) : Math.min(backL - 6, W + 24); adT.wrapS = THREE.RepeatWrapping; adT.repeat.set(adLen / 16, 1);
  var ads = new THREE.Mesh(new THREE.BoxGeometry(adLen, 0.9, 0.22), new THREE.MeshBasicMaterial({ map: adT, toneMapped: false })); ads.position.set(0, FY + 0.45, lineZ - 1.0); g.add(ads);

  // ----- Floodlights: lamp posts (tier 1), poles (2), towers (3, 4), very tall towers (5). Static lamps and soft glows. -----
  var glowTex = softTexture(), lit = night || dusk;
  var steel = stdm(snow ? 0x8a93a3 : 0x4a5266, 0.5), headM = stdm(0x2a3144, 0.5);
  var LK = { post: { pole: 0.13, fw: 1.5, fh: 0.8, cols: 2, rows: 1, glow: 7 }, pole: { pole: 0.2, fw: 2.8, fh: 1.7, cols: 3, rows: 2, glow: 11 }, tower: { pole: 0.34, fw: 4.2, fh: 3.0, cols: 4, rows: 3, glow: 15 }, mega: { pole: 0.55, fw: 6.0, fh: 4.0, cols: 5, rows: 4, glow: 20 } }[TC.lights];
  function tower(x, z) {
    var h = TC.lightH;
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(LK.pole * 0.75, LK.pole * 1.15, h, 8), steel); pole.position.set(x, FY + h / 2, z); g.add(pole);
    if (TC.lights === 'mega') { // a wider lattice foot: four legs leaning in
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) { var lg = new THREE.Mesh(new THREE.BoxGeometry(0.22, h * 0.45, 0.22), steel); lg.position.set(x + c[0] * 0.9, FY + h * 0.2, z + c[1] * 0.9); lg.rotation.set(c[1] * 0.18, 0, -c[0] * 0.18); g.add(lg); });
    }
    var head = new THREE.Group(); head.position.set(x, FY + h + LK.fh / 3, z); head.lookAt(0, FY + 3, 0); g.add(head); head.updateMatrix();
    var frame = new THREE.Mesh(new THREE.BoxGeometry(LK.fw, LK.fh, 0.4), headM); head.add(frame);
    var cw = LK.fw / LK.cols, rh = LK.fh / LK.rows; // the lamps of all four towers are merged into one mesh (one draw call)
    for (var a = 0; a < LK.rows; a++) for (var b = 0; b < LK.cols; b++) lampParts.push({ geo: new THREE.BoxGeometry(cw * 0.78, rh * 0.75, 0.12), color: 0xffffff, m: head.matrix.clone().multiply(mtx(-LK.fw / 2 + cw * (b + 0.5), -LK.fh / 2 + rh * (a + 0.5), 0.26)) });
    var gs = LK.glow * (night ? 1.6 : dusk ? 1.3 : 1), op = night ? 0.9 : Math.max(0.35, L.glowI);
    var gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xdfeaff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); gl.scale.set(gs, gs, 1); gl.position.copy(head.position); g.add(gl);
    if (lit && beamGeo) { // a faint, static beam from the lamp head down to the pitch
      var top = head.position.clone(), aim = new THREE.Vector3(x * 0.25, FY, z * 0.25 + 1), len = top.distanceTo(aim);
      var beam = new THREE.Mesh(beamGeo, beamMat); beam.scale.set(LK.fw / 4.2, len, LK.fw / 4.2); beam.position.copy(top).add(aim).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim.clone().sub(top).normalize()); beam.renderOrder = 3; g.add(beam);
    }
  }
  var beamGeo = null, beamMat = null;
  if (lit) {
    var bc = cvs(4, 64), bg2 = bc.getContext('2d'), bgr = bg2.createLinearGradient(0, 0, 0, 64);
    bgr.addColorStop(0, 'rgba(225,235,255,.55)'); bgr.addColorStop(1, 'rgba(225,235,255,0)'); bg2.fillStyle = bgr; bg2.fillRect(0, 0, 4, 64);
    beamGeo = new THREE.CylinderGeometry(0.9, 5.5, 1, 20, 1, true);
    beamMat = new THREE.MeshBasicMaterial({ map: ctex(bc, 1), transparent: true, opacity: night ? (wet || w.sky === 'fog' ? 0.22 : 0.16) : 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  }
  var out = TC.lights === 'mega' ? 2.5 : 1.5, tx = backL / 2 + out, tz = z0 - depthB - out, fx = standX + depthS + out, fz = D / 2 + (TC.lights === 'mega' ? 5 : 4);
  var lampParts = [];
  tower(-tx, tz); tower(tx, tz); tower(-fx, fz); tower(fx, fz);
  g.add(new THREE.Mesh(mergeGeos(lampParts), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false })));

  // ----- Corner flags (kit colours on the arena) -----
  var poleM = stdm(0xf8f9fa, 0.5), flagM = new THREE.MeshStandardMaterial({ color: TC.kitCorners ? new THREE.Color(kit.shirt) : 0xffd43b, roughness: 0.7, side: THREE.DoubleSide });
  [-1, 1].forEach(function (s) {
    var x = s * gx, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), poleM); pole.position.set(x, FY + 1.2, lineZ); g.add(pole);
    var fl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.55), flagM); fl.position.set(x - s * 0.4, FY + 2.1, lineZ); g.add(fl);
  });

  // ----- Goals with nets (wide layout only: tall has no room) -----
  if (goals) {
    var netT = netTexture(), postM = stdm(0xffffff, 0.35, { flatShading: false }), gw = 7, gh = 2.5, gd = 2.4;
    [-1, 1].forEach(function (s) {
      var gg = new THREE.Group(), x = s * gx, front = -s; // the mouth faces the table (toward the centre)
      gg.position.set(x, FY, goalZ);
      function bar(bw, bh, bd, px, py, pz) { var b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), postM); b.position.set(px, py, pz); gg.add(b); }
      bar(0.14, gh, 0.14, 0, gh / 2, -gw / 2); bar(0.14, gh, 0.14, 0, gh / 2, gw / 2); bar(0.14, 0.14, gw + 0.14, 0, gh, 0);
      var bk = -front * gd; // goal depth runs away from the table
      function net(nw, nh, px, py, pz, rx, ry, reps) {
        var t = netT.clone(); t.needsUpdate = true; t.repeat.set(reps[0], reps[1]);
        var m = new THREE.Mesh(new THREE.PlaneGeometry(nw, nh), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, fog: true }));
        m.position.set(px, py, pz); m.rotation.set(rx, ry, 0); gg.add(m);
      }
      net(gw, gh, bk, gh / 2, 0, 0, Math.PI / 2, [gw / 0.35, gh / 0.35]);
      net(gd, gh, bk / 2, gh / 2, -gw / 2, 0, 0, [gd / 0.35, gh / 0.35]); net(gd, gh, bk / 2, gh / 2, gw / 2, 0, 0, [gd / 0.35, gh / 0.35]);
      net(gd, gw, bk / 2, gh, 0, Math.PI / 2, 0, [gd / 0.35, gw / 0.35]);
      bar(Math.abs(bk), 0.08, 0.08, bk / 2, gh, -gw / 2); bar(Math.abs(bk), 0.08, 0.08, bk / 2, gh, gw / 2);
      g.add(gg);
    });
  }

  // ----- Flags in the kit colours along the top of the stands (tier 4+), merged: one mesh for poles, one for flags -----
  if (TC.flags) {
    var poleParts = [], flagParts = [], cols2 = [kit.shirt, kit.trim];
    stands.forEach(function (st) {
      st.g.updateMatrixWorld(true); var M = st.g.matrix, n = Math.max(2, Math.round(st.len / 5.5));
      for (var i = 0; i < n; i++) {
        var zz = (i + 0.5) * st.len / n, uu = st.depth - 0.25, yy = st.top;
        poleParts.push({ geo: new THREE.CylinderGeometry(0.05, 0.06, 2.6, 5), color: 0xdfe3ea, m: M.clone().multiply(mtx(uu, yy + 1.3, zz)) });
        flagParts.push({ geo: new THREE.PlaneGeometry(1.2, 0.75), color: cols2[i % 2], m: M.clone().multiply(mtx(uu - 0.02, yy + 2.15, zz + 0.62, 0, Math.PI / 2 + 0.12, 0)) });
      }
    });
    g.add(new THREE.Mesh(mergeGeos(poleParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true })));
    g.add(new THREE.Mesh(mergeGeos(flagParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide })));
  }

  // ----- Arena (tier 5): kit-colour banner on the upper-tier front, and a roof ring over the back of the upper tier -----
  if (TC.banners || TC.roof) {
    var fT = TC.banners ? fasciaTexture(kit) : null, roofTop = stdm(snow ? 0xf4f7fb : 0xd7dce4, 0.45), trimM = stdm(new THREE.Color(kit.trim).getHex(), 0.5), postP = [];
    stands.forEach(function (st) {
      if (TC.banners) { // fills the face between the two tiers
        var bh = gapU - 0.2, t2 = fT.clone(); t2.needsUpdate = true; t2.wrapS = THREE.RepeatWrapping; t2.repeat.set(Math.max(1, Math.round(st.len / 14)), 1);
        var fb = new THREE.Mesh(new THREE.PlaneGeometry(st.len, bh), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.7, emissive: 0xffffff, emissiveMap: t2, emissiveIntensity: night || dusk ? 0.35 : 0.08 }));
        fb.rotation.y = -Math.PI / 2; fb.position.set(st.u0 - 0.04, st.lowTop + gapU / 2, st.len / 2); st.g.add(fb);
      }
      if (TC.roof) {
        var ry0 = st.top + 4.2, rd = 2.8, ru = st.depth - rd / 2 + 0.9;
        var roof = new THREE.Mesh(new THREE.BoxGeometry(rd, 0.22, st.len + (st.team === 'back' ? 0 : 0.2)), roofTop); roof.position.set(ru, ry0, st.len / 2); roof.rotation.z = -0.1; st.g.add(roof); // the front edge a little higher
        var edge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, st.len), trimM); edge.position.set(ru - rd / 2, ry0 - 0.05, st.len / 2); st.g.add(edge);
        st.g.updateMatrixWorld(true);
        var np = Math.max(2, Math.round(st.len / 7));
        for (var i = 0; i <= np; i++) postP.push({ geo: new THREE.BoxGeometry(0.22, ry0 - st.top + 0.6, 0.22), color: 0x8a93a3, m: st.g.matrix.clone().multiply(mtx(st.depth + 0.25, st.top + (ry0 - st.top) / 2 - 0.1, i * st.len / np)) });
      }
    });
    if (postP.length) g.add(new THREE.Mesh(mergeGeos(postP), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true })));
  }

  // ----- Beyond a small ground (tiers 1-2): a low wall and trees, one merged mesh -----
  if (TC.trees) {
    var tp = [], RT = rng(808 + tier), trunkC = 0x6b4a2c, leafCs = snow ? [0xe6edf4, 0xd6e0ea, 0xc8d4de] : [0x2f7a34, 0x3a8f3c, 0x26662c, 0x4a9a3e];
    var bz = z0 - depthB - 2.2, wallL = backL + 2 * depthS + 6;
    tp.push({ geo: new THREE.BoxGeometry(wallL, 0.9, 0.35), color: snow ? 0xd8e0ea : 0x9a8f86, m: mtx(0, FY + 0.45, bz) });
    var spots = [];
    for (var i = 0; i < 13; i++) spots.push([-wallL / 2 + 2 + i * (wallL - 4) / 12 + (RT() - 0.5) * 1.5, bz - 4.5 - RT() * 6]);
    [-1, 1].forEach(function (s) { for (var j = 0; j < 5; j++) spots.push([s * (standX + depthS + 3 + RT() * 4), sideZ0 + 2 + j * (sideZ1 - sideZ0 + 6) / 5]); });
    spots.forEach(function (p) {
      var h = 1.6 + RT() * 1.4, s2 = 1.0 + RT() * 0.9;
      tp.push({ geo: new THREE.CylinderGeometry(0.18, 0.26, h, 6), color: trunkC, m: mtx(p[0], FY + h / 2, p[1]) });
      tp.push({ geo: new THREE.IcosahedronGeometry(s2, 0), color: leafCs[Math.floor(RT() * leafCs.length)], m: mtx(p[0], FY + h + s2 * 0.6, p[1], RT(), RT(), 0, 1, 0.85, 1) });
    });
    g.add(new THREE.Mesh(mergeGeos(tp), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true })));
  }

  // ----- Weather: mist banks for fog, rain or snow particles (weather.js) -----
  if (w.sky === 'fog') {
    var mp = [], RM = rng(17);
    stands.forEach(function (st) { st.g.updateMatrixWorld(true); for (var i = 0; i < Math.max(2, Math.round(st.len / 10)); i++) { v.set(st.depth * (0.2 + RM() * 0.8), 1.2 + RM() * 1.5, (i + 0.5) * st.len / Math.max(2, Math.round(st.len / 10))).applyMatrix4(st.g.matrix); mp.push([v.x, v.y, v.z, 12 + RM() * 8]); } });
    mistBanks(g, RM, mp, new THREE.Color(L.fog[0]).lerp(new THREE.Color(0xffffff), 0.35));
  }
  var wx = null;
  if (w.sky === 'rain' || w.sky === 'snow') {
    wx = makeParticles({ kind: w.sky, quality: quality, night: night || dusk,
      box: { x0: -(standX + depthS + 4), x1: standX + depthS + 4, z0: z0 - depthB - 4, z1: D / 2 + 12, y0: FY, y1: FY + (w.sky === 'rain' ? 16 : 18) },
      clear: { hw: W / 2 + 2.0, hd0: -D / 2 - 4.5, hd1: D / 2 + 3.5 } });
    g.add(wx.points);
  }

  // ----- Camera flashbulbs: pooled sprites, used once per 'flash' -----
  var fT2 = flashTexture(), flashes = [], FN = 28;
  for (var q = 0; q < FN; q++) { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fT2, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.visible = false; sp.renderOrder = 4; g.add(sp); flashes.push({ sp: sp, t0: 0, dur: 0 }); }

  // night: the main light comes from the front-left floodlight tower (key light for the stage agent's shadows)
  var keyL = null;
  if (night) { keyL = keyLight(0xeef3ff, 1.35, -fx, FY + 30, D / 2 + 9, W, D); g.add(keyL); }

  var flashing = false;
  var api = {
    group: g, legs: true, key: keyL, board: screen, tier: tier, weather: w,
    setBoard: function (text) { paintBoard(bcv, text, frameCol); btex.needsUpdate = true; },
    wave: function () { if (document.hidden || quality() < 1 || !N) return false; return crowd.react('wave'); },
    // crowd reactions: 'clap' | 'ooh' | 'gasp' | 'cheer' | 'aw' (see crowd.js); also reachable as T3.crowd(kind, opts)
    crowd: function (kind, opts) { if (document.hidden) return false; return crowd.react(kind, opts); },
    flash: function () {
      if (document.hidden || !N) return false;
      var qq = quality(), n = qq >= 2 ? FN : qq === 1 ? 14 : 6, now = performance.now();
      for (var i = 0; i < FN; i++) {
        var f = flashes[i]; if (i >= n) { f.dur = 0; continue; }
        var p = pts[Math.floor(R() * N)]; f.sp.position.set(p.x, p.y + 1.1, p.z); f.t0 = now + R() * 1300; f.dur = 200 + R() * 120; f.sp.visible = false; f.sp.material.opacity = 0;
        f.sc = 1.6 + R() * 1.4;
      }
      flashing = true; return true;
    },
    step: function (now) { // returns true while something is still moving (or a capped-rate weather frame is due)
      var busy = crowd.step(now);
      if (flashing) {
        var live = false;
        for (var i = 0; i < FN; i++) {
          var f = flashes[i]; if (!f.dur) continue;
          var kk = (now - f.t0) / f.dur;
          if (kk < 0) { live = true; continue; }
          if (kk >= 1) { f.sp.visible = false; f.sp.material.opacity = 0; f.dur = 0; continue; }
          live = true; var a = kk < 0.2 ? kk / 0.2 : 1 - (kk - 0.2) / 0.8; f.sp.visible = true; f.sp.material.opacity = a; f.sp.scale.setScalar(f.sc * (0.5 + a));
        }
        if (!live) flashing = false; else busy = true;
      }
      if (wx && wx.step(now)) busy = true;
      return busy;
    },
    // for checks and the notes: what this build holds
    stats: function () { var c = crowd.stats(); return { tier: tier, weather: w, people: c.people, crowdDraws: c.draws, crowdTris: c.tris, particles: wx ? wx.stats() : null }; },
    dispose: function () { crowd.reset(); flashing = false; if (wx) wx.dispose(); }
  };
  return api;
}
