// VARI3D: the variation cards in 3D (docs/handoff/vari3d.md).
// Shared by the table (js/three/table.js: the Goal row) and the Goal replay (js/three/replay.js: a Solution):
//   variRow(tokens, fractions) -> one entry per token: {turn, exp, bang, cap}
//     turn: how far the cube rests turned about the vertical axis (0, PI upside-down, -PI/2 sideways: a quarter turn
//           clockwise, like the flat builder's picture). Percent is an upside-down root, Remainder a sideways divide.
//     exp:  an Exponent Colour digit used as a power (sits raised and smaller, top-right of the slot before it)
//     bang: a written-in "!" (Factorial), drawn as a chalk "!"
//     cap:  the small label over the cube ("−3", "1/3", "average", "LCM", "10", "# factors", ...) or ''; texts from
//           Vari.capOf, plus "wild" (a 0 under 0 Wild) and "base 8" (over the first digit of a two-digit numeral)
//   labelTex(text) -> {tex, aspect, hk}: a crisp pill label texture (hk: height factor, a stacked fraction is taller)
//   bangTex() -> the chalk "!" texture (one, shared, never disposed)
//   stack(items, obstacles, pad) -> lifts labels until none overlaps another label or a cube
//   createLabels({camera, renderer, scene}) -> billboard labels over table cubes, laid out on screen every frame
//   heldTurn(mesh, turn, now): a carried Goal cube turns smoothly in the hand (about 0.45 s after it is lifted)
// Nothing here runs without a variation card: the table and the replay only call it when a card is in play.
import * as THREE from 'three';

function sym(t) { return typeof t === 'string' ? t : t && t.s; }

export function variRow(tokens, fractions) {
  var E = window.Eq, V = window.Vari, RU = E.rulesOf(fractions);
  return (tokens || []).map(function (t, i) {
    var s = sym(t), r = { turn: 0, exp: false, bang: s === '!', cap: '' };
    if (typeof t !== 'object' || !t || s === '(' || s === ')') return r;
    var o = E.orient(s);
    if ((o && o.o === 'u') || s === '%') r.turn = Math.PI;             // upside-down (Percent: an upside-down root)
    else if ((o && o.o === 's') || s === 'm') r.turn = -Math.PI / 2;   // sideways (Remainder: a sideways divide)
    r.exp = E.exOf(s) >= 0;
    var c = '';
    try { c = V && V.capOf ? V.capOf(s, RU, tokens, i) : ''; } catch (e) { c = ''; }
    if (r.exp) c = '';                                                 // its place says it: raised and small
    else if (c === 'lcm' || c === 'gcf') c = c.toUpperCase();
    if (!c && RU.wild && s === '0') c = 'wild';                        // 0 Wild: a 0 stands for any one digit
    if (!c && RU.basem && E.isDigit(s) && E.isDigit(sym(tokens[i + 1])) && !(i > 0 && E.isDigit(sym(tokens[i - 1])))) c = 'base ' + RU.base; // Base m: a two-digit numeral counts in m
    r.cap = c;
    return r;
  });
}
export function anyVari(row) { return !!row && row.some(function (r) { return r.turn || r.exp || r.bang || r.cap; }); }

// ---- textures ----
var FONT = '"Trebuchet MS", "Segoe UI", sans-serif';
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function labelTex(text) {
  var frac = /^1\/(\d)$/.exec(text), H = 96, TIP = 13, hk = frac ? 1.45 : 1;
  var cv = document.createElement('canvas'), g = cv.getContext('2d'), fs = 56, h = Math.round(H * hk);
  g.font = '800 ' + fs + 'px ' + FONT;
  var tw = frac ? g.measureText('8').width * 1.3 : g.measureText(text).width, w = Math.ceil(Math.max(tw + 44, h * 0.9));
  cv.width = w; cv.height = h; g.font = '800 ' + fs + 'px ' + FONT;   // (resizing the canvas resets the font)
  var bh = h - TIP;
  g.fillStyle = 'rgba(20,24,48,.28)'; rr(g, 4, 6, w - 8, bh - 7, Math.min(28, bh / 2 - 2)); g.fill();       // soft shadow
  g.fillStyle = '#fffaf0'; rr(g, 2, 2, w - 8, bh - 7, Math.min(28, bh / 2 - 2)); g.fill();
  g.lineWidth = 4; g.strokeStyle = '#2b3150'; g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 12, bh - 6); g.lineTo(w / 2, h - 1); g.lineTo(w / 2 + 12, bh - 6); g.closePath(); g.fillStyle = '#2b3150'; g.fill(); // a small pointer down to the cube
  g.fillStyle = '#1d2240'; g.textAlign = 'center'; g.textBaseline = 'middle';
  var cx = w / 2 - 2, cy = (bh - 5) / 2 + 2;
  if (frac) {                                                          // 1 over d, stacked like a real fraction
    g.font = '800 ' + Math.round(fs * 0.95) + 'px ' + FONT;
    g.fillText('1', cx, cy - bh * 0.22); g.fillText(frac[1], cx, cy + bh * 0.23);
    g.fillRect(cx - 20, cy - 3, 40, 5);
  } else g.fillText(text, cx, cy + 1);
  var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, aspect: w / h, hk: hk };
}
var bang = null;
export function bangTex() {
  if (bang) return bang;
  var cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; var g = cv.getContext('2d');
  function mark(dx, dy, col) {                                       // a hand-drawn stroke, slightly slanted, and its dot
    g.lineCap = 'round'; g.strokeStyle = col; g.fillStyle = col;
    g.lineWidth = 19; g.beginPath(); g.moveTo(30 + dx, 14 + dy); g.lineTo(33 + dx, 78 + dy); g.stroke();
    g.beginPath(); g.arc(33 + dx, 105 + dy, 11, 0, Math.PI * 2); g.fill();
  }
  mark(3, 3, 'rgba(0,0,0,.35)');                                     // the same soft shadow as the parentheses
  var sh = document.createElement('canvas'); sh.width = 64; sh.height = 128; var g0 = g; g = sh.getContext('2d');
  mark(0, 0, '#fdfdf6');
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  g.globalCompositeOperation = 'destination-out';                    // chalk grain (always the same pattern: no flicker)
  for (var i = 0; i < 140; i++) { g.globalAlpha = 0.2 + rnd() * 0.4; g.fillRect(12 + rnd() * 42, 4 + rnd() * 116, 1 + rnd() * 2, 1 + rnd() * 2); }
  g = g0; g.drawImage(sh, 0, 0);
  bang = new THREE.CanvasTexture(cv); bang.colorSpace = THREE.SRGBColorSpace;
  return bang;
}

// ---- layout: rects in screen order (y grows downwards). items: {x0, x1, y0, y1, own}; obstacles: {x0, x1, y0, y1, id}.
// Left to right, each item goes just over its cube; if that spot touches a label placed before it or another cube, it tries
// beside its cube (it.box: right, then left: a view looking along the row), and only then is lifted just above whatever
// it touches until it touches nothing. it.dx / it.lift = how far it moved. Bounded, so a crowded view cannot loop forever.
export function stack(items, obstacles, pad) {
  pad = pad || 0;
  var placed = [], order = items.map(function (it, i) { return i; }).sort(function (a, b) { return items[a].x0 - items[b].x0; });
  function hit(a, b) { return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad; }
  order.forEach(function (i) {
    var it = items[i], r = { x0: it.x0, x1: it.x1, y0: it.y0, y1: it.y1 }, w = it.x1 - it.x0, h = it.y1 - it.y0;
    function free(q) { return !placed.some(function (p) { return hit(p, q); }) && !obstacles.some(function (o) { return o.id !== it.own && hit(o, q); }); }
    it.dx = 0;
    if (!free(r) && it.box) {
      var cy = (it.box.y0 + it.box.y1) / 2, side = [{ x0: it.box.x1 + pad * 2, x1: it.box.x1 + pad * 2 + w }, { x0: it.box.x0 - pad * 2 - w, x1: it.box.x0 - pad * 2 }];
      for (var k = 0; k < 2; k++) { var q = { x0: side[k].x0, x1: side[k].x1, y0: cy - h / 2, y1: cy + h / 2 }; if (free(q)) { it.dx = q.x0 - it.x0; it.lift = it.y0 - q.y0; placed.push(q); return; } }
    }
    for (var n = 0; n < 24; n++) {
      var top = Infinity;
      placed.forEach(function (p) { if (hit(p, r)) top = Math.min(top, p.y0); });
      obstacles.forEach(function (o) { if (o.id !== it.own && hit(o, r)) top = Math.min(top, o.y0); });
      if (top === Infinity) break;
      var d = r.y1 - (top - pad); r.y0 -= d; r.y1 -= d;
    }
    it.lift = it.y0 - r.y0; placed.push(r);
  });
  return items;
}

// ---- billboard labels over table cubes ----
// set(list, cubes): list = [{mesh, text}], cubes = every mesh in the row (kept clear of labels). frame(hidden, moving):
// lays them out in screen pixels (17-28 px tall, growing a little when the view comes closer) and places each sprite
// so it faces the camera exactly there. clear(): disposes everything (a new shake).
export function createLabels(o) {
  var cam = o.camera, renderer = o.renderer, scene = o.scene, list = [], cubes = [], cache = {}, pool = [];
  var v = new THREE.Vector3(), w = new THREE.Vector3(), size = new THREE.Vector2(), right = new THREE.Vector3();
  function texFor(text) { return cache[text] || (cache[text] = labelTex(text)); }
  function set(items, rowMeshes) {
    list.forEach(function (L) { L.sp.visible = false; });
    list = items.map(function (it, i) {
      var sp = pool[i];
      if (!sp) { sp = pool[i] = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false })); sp.renderOrder = 20; sp.visible = false; sp.frustumCulled = false; scene.add(sp); }
      var T = texFor(it.text);
      if (sp.material.map !== T.tex) { sp.material.map = T.tex; sp.material.needsUpdate = true; }
      return { mesh: it.mesh, text: it.text, T: T, sp: sp };
    });
    cubes = rowMeshes || list.map(function (L) { return L.mesh; });
  }
  function clear() {
    pool.forEach(function (sp) { if (sp.parent) sp.parent.remove(sp); sp.material.dispose(); });
    Object.keys(cache).forEach(function (k) { cache[k].tex.dispose(); });
    pool = []; list = []; cubes = []; cache = {};
  }
  function toScreen(p, W, H) { v.copy(p).project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, z: v.z, ok: v.z > -1 && v.z < 1 }; }
  function box(m, W, H) {
    var s = m.scale.x * 0.5, b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, ok: true };
    for (var k = 0; k < 8; k++) {
      w.set(m.position.x + (k & 1 ? s : -s), m.position.y + (k & 2 ? s : -s), m.position.z + (k & 4 ? s : -s));
      var p = toScreen(w, W, H); if (!p.ok) b.ok = false;
      b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y);
    }
    return b;
  }
  function frame(hidden, moving) {
    if (!list.length) return;
    renderer.getSize(size); var W = size.x, H = size.y;
    if (!W || !H) return;
    cam.updateMatrixWorld();
    right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    var obst = [];
    cubes.forEach(function (m) { if (m && m.visible) { var b = box(m, W, H); if (b.ok) { b.id = m.id; obst.push(b); } } });
    var items = [];
    list.forEach(function (L) {
      var m = L.mesh, show = !hidden && m && m.visible && !moving(m);
      L.sp.visible = false; if (!show) return;
      var c = toScreen(m.position, W, H); if (!c.ok || c.x < 0 || c.x > W || c.y < 0 || c.y > H) return; // its cube is out of the picture
      w.copy(m.position).addScaledVector(right, 1); var c2 = toScreen(w, W, H);
      var ppu = Math.hypot(c2.x - c.x, c2.y - c.y), h = Math.max(17, Math.min(28, 0.5 * ppu)) * L.T.hk, wd = h * L.T.aspect;
      var b = box(m, W, H), bottom = b.y0 - 2;
      items.push({ L: L, x0: c.x - wd / 2, x1: c.x + wd / 2, y0: bottom - h, y1: bottom, h: h, own: m.id, z: c.z, box: b });
    });
    if (!items.length) return;
    stack(items, obst, 2);
    items.forEach(function (it) {
      var cx = (it.x0 + it.x1) / 2 + it.dx, cy = (it.y0 + it.y1) / 2 - it.lift, nx = cx / W * 2 - 1, ny = 1 - cy / H * 2, nz = Math.min(0.999, it.z);
      var p0 = new THREE.Vector3(nx, ny, nz).unproject(cam), p1 = new THREE.Vector3(nx, ny + it.h / H * 2, nz).unproject(cam), wh = p0.distanceTo(p1);
      it.L.sp.position.copy(p0); it.L.sp.scale.set(wh * it.L.T.aspect, wh, 1); it.L.sp.visible = true;
    });
  }
  return { set: set, clear: clear, frame: frame, count: function () { return list.length; } };
}

// ---- a carried Goal cube turns in the hand ----
// The carrier (js/three/player.js, creatures.js) writes the cube's orientation every frame from its own copy; this runs
// after them and turns that orientation about the vertical axis, easing in over 0.45 s from the moment it is held.
// mesh.userData.vturn tells T3.sync that the cube was turned in the hand (so landing does not turn it back).
var held = { id: null, t0: 0, base: new THREE.Quaternion(), wrote: new THREE.Quaternion(), on: false };
var UP = new THREE.Vector3(0, 1, 0), qy = new THREE.Quaternion();
export function heldTurn(m, turn, now) {
  if (!m || !turn) { held.id = null; held.on = false; return false; }
  if (held.id !== m.id) { held.id = m.id; held.t0 = now; held.on = false; }
  var k = Math.min(1, (now - held.t0) / 450), e = k * k * (3 - 2 * k);
  if (!(held.on && m.quaternion.equals(held.wrote))) held.base.copy(m.quaternion);   // the carrier wrote a fresh orientation
  m.quaternion.copy(qy.setFromAxisAngle(UP, turn * e)).multiply(held.base);
  held.wrote.copy(m.quaternion); held.on = true;
  m.userData.vturn = turn;
  return k < 1;
}
