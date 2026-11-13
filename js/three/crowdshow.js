// Supporters' displays for the stadium crowd (crowd.js builds and drives them). Everything here is static until an
// event triggers it, makes ONE move, and is still again:
//   banners   hand-made banners held up by pairs of fans (one InstancedMesh, one canvas texture). They arrive rolled up
//             and unfurl once (the first reaction of a match); then they stay as they are.
//   tifo      a card stunt in the back stand: on a big moment every seat in the block raises a card in one sweep, the
//             cards make a picture (his number, a dice cube, GOAL, a star), hold it, and go down again (one InstancedMesh
//             on the crowd's own material; hidden, so no draw call, when not in use).
//   confetti  cannons on the stand fronts after a match win: one burst, falls, settles, fades (Points, hidden after).
//   phones    at dusk and night, after a win: phone lights come on once in a ripple and stay lit (Points).
// The caller decides when (crowd.js, from the moment a reaction means). Nothing here loops.
import * as THREE from 'three';

function sm(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
function outBack(x) { var c = 1.4; x = Math.max(0, Math.min(1, x)) - 1; return 1 + (c + 1) * x * x * x + c * x * x; }

// =====================================================================================================
// Banners
// =====================================================================================================
var BCOLS = 2, BROWS = 8, BW = 512, BH = 128;
var HAND = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", "Trebuchet MS", sans-serif';
function paintBanner(g, slot, s) {
  var ox = (slot % BCOLS) * BW, oy = Math.floor(slot / BCOLS) * BH, R = s.seed || 1;
  function rnd() { R = (R * 16807) % 2147483647; return R / 2147483647; }
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, BW, BH); g.clip();
  g.fillStyle = s.bg; g.fillRect(0, 0, BW, BH);
  // a painted border, a little wobbly (hand-made)
  g.strokeStyle = s.edge; g.lineWidth = 7; g.lineJoin = 'round'; g.beginPath();
  var pts = [[10, 10], [BW / 2, 9], [BW - 10, 11], [BW - 9, BH / 2], [BW - 11, BH - 10], [BW / 2, BH - 9], [10, BH - 11], [9, BH / 2]];
  pts.forEach(function (p, i) { var x = p[0] + (rnd() - 0.5) * 3, y = p[1] + (rnd() - 0.5) * 3; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke();
  // the words, one painted letter at a time (slight tilt and bounce, two colours)
  var text = String(s.text || ''), size = 84;
  g.textBaseline = 'middle'; g.textAlign = 'left';
  do { g.font = '900 ' + size + 'px ' + HAND; size -= 3; } while (g.measureText(text).width > BW - 56 && size > 26);
  var x = (BW - g.measureText(text).width) / 2;
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i), w = g.measureText(ch).width;
    g.save(); g.translate(x + w / 2, BH / 2 + 3 + (rnd() - 0.5) * 6); g.rotate((rnd() - 0.5) * 0.12);
    g.lineWidth = Math.max(4, size * 0.09); g.strokeStyle = s.out; g.strokeText(ch, -w / 2, 0);
    g.fillStyle = ch === '♥' ? '#e64980' : (i % 2 && s.fg2 ? s.fg2 : s.fg); g.fillText(ch, -w / 2, 0);
    g.restore(); x += w;
  }
  g.restore();
}
// specs: [{ x, y, z (top centre, group space), ax, az (along the banner), nx, nz (facing the pitch), w, h, text, bg, fg, fg2, out, edge }]
export function makeBanners(group, specs) {
  if (!specs.length) return null;
  var cv = document.createElement('canvas'); cv.width = BCOLS * BW; cv.height = BROWS * BH;
  var g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  function paintAll() { g.clearRect(0, 0, cv.width, cv.height); specs.forEach(function (s, i) { paintBanner(g, i, Object.assign({ seed: 7 + i * 31 }, s)); }); tex.needsUpdate = true; }
  paintAll();
  var geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, -0.5, 0);
  var rect = new Float32Array(specs.length * 4);
  specs.forEach(function (s, i) { var c = i % BCOLS, r = Math.floor(i / BCOLS); rect.set([c / BCOLS, 1 - (r + 1) / BROWS, 1 / BCOLS, 1 / BROWS], i * 4); });
  geo.setAttribute('bRect', new THREE.InstancedBufferAttribute(rect, 4));
  var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, side: THREE.DoubleSide });
  mat.onBeforeCompile = function (sh) {
    sh.vertexShader = 'attribute vec4 bRect;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = uv * bRect.zw + bRect.xy;');
  };
  mat.customProgramCacheKey = function () { return 'crowdBanner1'; };
  var mesh = new THREE.InstancedMesh(geo, mat, specs.length); mesh.name = 'crowd:banners'; mesh.frustumCulled = false;
  group.add(mesh);
  var arr = mesh.instanceMatrix.array, open = new Float32Array(specs.length), t0 = new Float32Array(specs.length), anim = false;
  function place(i, k) { // k: 0 rolled up .. 1 open
    var s = specs[i], o = i * 16, h = s.h * (0.06 + 0.94 * k);
    if (!s.text) { for (var z = 0; z < 16; z++) arr[o + z] = 0; return; } // no words (no rivalry yet): no banner
    arr[o] = s.ax * s.w; arr[o + 1] = 0; arr[o + 2] = s.az * s.w; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = h; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = s.nx; arr[o + 9] = 0; arr[o + 10] = s.nz; arr[o + 11] = 0;
    arr[o + 12] = s.x; arr[o + 13] = s.y; arr[o + 14] = s.z; arr[o + 15] = 1;
  }
  for (var i = 0; i < specs.length; i++) place(i, 0);
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh: mesh, specs: specs,
    isOpen: function () { for (var i = 0; i < specs.length; i++) if (open[i] < 1) return false; return true; },
    // unfurl once (each banner a beat after the last); instant: no unrolling (reduced motion)
    unfurl: function (now, instant) {
      var any = false;
      for (var i = 0; i < specs.length; i++) if (!open[i]) { open[i] = instant ? 1 : 0.0001; t0[i] = now + i * 140; if (instant) place(i, 1); any = true; }
      if (instant && any) mesh.instanceMatrix.needsUpdate = true;
      anim = anim || (any && !instant);
      return any;
    },
    furl: function () { for (var i = 0; i < specs.length; i++) { open[i] = 0; place(i, 0); } anim = false; mesh.instanceMatrix.needsUpdate = true; },
    setOpen: function () { for (var i = 0; i < specs.length; i++) { open[i] = 1; place(i, 1); } anim = false; mesh.instanceMatrix.needsUpdate = true; },
    retext: function (texts) { texts.forEach(function (t, i) { if (specs[i] && t != null) specs[i].text = t; }); paintAll(); for (var i = 0; i < specs.length; i++) place(i, open[i] >= 1 ? 1 : open[i] > 0 ? open[i] : 0); mesh.instanceMatrix.needsUpdate = true; },
    step: function (now) {
      if (!anim) return false;
      var live = false;
      for (var i = 0; i < specs.length; i++) {
        if (open[i] <= 0 || open[i] >= 1) continue;
        var k = (now - t0[i]) / 900;
        if (k >= 1) { open[i] = 1; place(i, 1); continue; }
        live = true; if (k > 0) { open[i] = Math.max(0.0001, k); place(i, outBack(k)); }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (!live) anim = false;
      return true;
    },
    dispose: function () { geo.dispose(); mat.dispose(); tex.dispose(); }
  };
}

// =====================================================================================================
// Tifo card stunt
// =====================================================================================================
// 3 x 5 pixel letters (rows top to bottom)
var FONT = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'], G: ['111', '100', '101', '101', '111'], O: ['111', '101', '101', '101', '111'],
  A: ['010', '101', '111', '101', '101'], L: ['100', '100', '100', '100', '111']
};
// a picture on a cols x rows grid: returns fn(c, r) -> 0 background, 1 picture, 2 accent
export function tifoPicture(kind, cols, rows, text) {
  var px = {};
  function set(c, r, v) { if (c >= 0 && r >= 0 && c < cols && r < rows) px[c + ',' + r] = v; }
  function word(s) {
    var n = s.length, w0 = n * 4 - 1, k = Math.max(1, Math.min(Math.floor((cols - 2) / w0), Math.floor((rows - 1) / 5)));
    var x0 = Math.floor((cols - w0 * k) / 2), y0 = Math.floor((rows - 5 * k) / 2);
    for (var i = 0; i < n; i++) { var f = FONT[s.charAt(i)]; if (!f) continue; for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) if (f[r].charAt(c) === '1') for (var a = 0; a < k; a++) for (var b = 0; b < k; b++) set(x0 + (i * 4 + c) * k + a, y0 + r * k + b, 1); }
    return w0 * k <= cols && 5 <= rows;
  }
  if (kind === 'cube') { // a dice face: a white square with five accent pips
    var sz = Math.min(rows, cols) - (rows > 6 ? 1 : 0), x0 = Math.floor((cols - sz) / 2), y0 = Math.floor((rows - sz) / 2);
    for (var r = 0; r < sz; r++) for (var c = 0; c < sz; c++) set(x0 + c, y0 + r, 1);
    var q = Math.max(1, Math.round(sz / 4)), m = Math.floor(sz / 2);
    [[q, q], [sz - 1 - q, q], [m, m], [q, sz - 1 - q], [sz - 1 - q, sz - 1 - q]].forEach(function (p) { set(x0 + p[0], y0 + p[1], 2); });
  } else if (kind === 'star') {
    var cx = (cols - 1) / 2, cy = (rows - 1) / 2, R0 = Math.min(cols, rows * 1.05) / 2;
    for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) {
      var dx = (c2 - cx) / R0, dy = (r2 - cy) / R0, a = Math.atan2(dy, dx) + Math.PI / 2, d = Math.hypot(dx, dy);
      var lim = 0.42 + 0.55 * Math.pow(Math.abs(Math.cos(2.5 * a)), 3);
      if (d < lim) set(c2, r2, 1);
    }
  } else if (!word(text || 'GOAL')) word(String(text || '').slice(0, 1));
  return function (c, r) { return px[c + ',' + r] || 0; };
}
// cards: [{ x, y, z, ry, c (column), r (row: 0 = front, drawn from the top: rows - 1 - r) }]; geo: the card (pivot on its
// bottom edge, front +z); mat: the crowd material (colour A = front, B = back)
export function makeTifo(group, cards, geo, mat, cols, rows) {
  if (!cards.length) return null;
  var n = cards.length, A = new Float32Array(n * 3), B = new Float32Array(n * 3), Cc = new Float32Array(n * 3), Me = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) { Me[i * 3] = -1; Me[i * 3 + 1] = -1; B[i * 3] = B[i * 3 + 1] = B[i * 3 + 2] = 0.94; }
  geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 3)); geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
  geo.setAttribute('iC', new THREE.InstancedBufferAttribute(Cc, 3)); geo.setAttribute('iMeta', new THREE.InstancedBufferAttribute(Me, 3));
  var mesh = new THREE.InstancedMesh(geo, mat, n); mesh.name = 'crowd:tifo'; mesh.frustumCulled = false; mesh.visible = false;
  group.add(mesh);
  var arr = mesh.instanceMatrix.array, delay = new Float32Array(n), run = null, col = new THREE.Color();
  function place(i, k) { // k: 0 down on the lap (flat, tiny) .. 1 held up
    // held up it leans back a little, toward the seats across the pitch (and his seat); hy: as tall as the row's step
    var p = cards[i], o = i * 16, s = 0.15 + 0.85 * k, rx = -(1 - k) * 1.45 - 0.3 * k, cy = Math.cos(p.ry), sy = Math.sin(p.ry), cx = Math.cos(rx), sx = Math.sin(rx), w = s * 1.05, h = s * (p.hy || 1);
    // R = Ry(ry) * Rx(rx), then scale (w, h, s)
    arr[o] = cy * w; arr[o + 1] = 0; arr[o + 2] = -sy * w; arr[o + 3] = 0;
    arr[o + 4] = sy * sx * h; arr[o + 5] = cx * h; arr[o + 6] = cy * sx * h; arr[o + 7] = 0;
    arr[o + 8] = sy * cx * s; arr[o + 9] = -sx * s; arr[o + 10] = cy * cx * s; arr[o + 11] = 0;
    arr[o + 12] = p.x; arr[o + 13] = p.y - 0.35 * (1 - k); arr[o + 14] = p.z; arr[o + 15] = 1;
  }
  return {
    mesh: mesh, cards: cards, busy: function () { return !!run; },
    // show(pic(c, r) -> 0|1|2, colours [bg, picture, accent], now, calm): the sweep, the hold, the cards down. Returns the
    // per-card delays (ms) and the total time, so the fans holding the cards can raise their arms in step.
    show: function (pic, cols3, now, calm) {
      for (var i = 0; i < n; i++) {
        var p = cards[i], v = pic(p.c, rows - 1 - p.r);
        col.set(cols3[v] || cols3[0]); A[i * 3] = col.r; A[i * 3 + 1] = col.g; A[i * 3 + 2] = col.b;
        delay[i] = calm ? 0 : (p.c / Math.max(1, cols - 1)) * 750 + p.r * 45;
        place(i, 0);
      }
      geo.attributes.iA.needsUpdate = true; mesh.instanceMatrix.needsUpdate = true; mesh.visible = true;
      run = { t0: now, up: calm ? 250 : 420, hold: 3300, down: calm ? 250 : 650 };
      run.end = 750 + run.up + run.hold + run.down + 100;
      return { delay: delay, up: run.up, hold: run.hold, down: run.down, dur: run.end };
    },
    step: function (now) {
      if (!run) return false;
      var s = now - run.t0;
      if (s >= run.end) { run = null; mesh.visible = false; return true; }
      var downAt = 750 + run.up + run.hold;
      for (var i = 0; i < n; i++) {
        var t = s - delay[i], k = t <= 0 ? 0 : t < run.up ? outBack(t / run.up) : 1;
        if (s > downAt) k = Math.min(k, 1 - sm((s - downAt - delay[i] * 0.3) / run.down));
        place(i, Math.max(0, k));
      }
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },
    stop: function () { run = null; mesh.visible = false; },
    dispose: function () { geo.dispose(); }
  };
}

// =====================================================================================================
// Points with a size and an alpha per point (confetti, phone lights): PointsMaterial plus two attributes
// =====================================================================================================
var glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); glowTex = new THREE.CanvasTexture(c); return glowTex;
}
function pointsMat(o) {
  var m = new THREE.PointsMaterial(Object.assign({ size: 1, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }, o));
  m.onBeforeCompile = function (sh) {
    sh.vertexShader = 'attribute float aSize;\nattribute float aAlpha;\nvarying float vAlpha;\n' + sh.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * aSize; vAlpha = aAlpha;');
    sh.fragmentShader = 'varying float vAlpha;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vAlpha;');
  };
  m.customProgramCacheKey = function () { return 'crowdPts' + (o.map ? 'G' : 'S'); };
  return m;
}
function pointsOf(n, mat) {
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  var p = new THREE.Points(geo, mat); p.frustumCulled = false; p.visible = false; p.renderOrder = 3;
  return p;
}

// confetti cannons: origins [{x, y, z, nx, nz}] (the stand front, nx/nz toward the pitch); floor: the pitch height
export function makeConfetti(group, max, floor) {
  var pts = pointsOf(max, pointsMat({ size: 0.26 })), geo = pts.geometry; pts.name = 'crowd:confetti';
  group.add(pts);
  var P = geo.attributes.position.array, Cl = geo.attributes.color.array, Sz = geo.attributes.aSize.array, Al = geo.attributes.aAlpha.array;
  var V = new Float32Array(max * 3), T0 = new Float32Array(max), ph = new Float32Array(max), n = 0, run = null, col = new THREE.Color();
  return {
    points: pts, busy: function () { return !!run; },
    burst: function (origins, cols, now, count) {
      n = Math.min(max, count); if (!n || !origins.length) return false;
      for (var i = 0; i < n; i++) {
        var o = origins[i % origins.length], a = Math.random() * 6.2832, sp = 0.6 + Math.random() * 1.6;
        P[i * 3] = o.x; P[i * 3 + 1] = o.y; P[i * 3 + 2] = o.z;
        V[i * 3] = o.nx * (2.2 + Math.random() * 2.4) + Math.cos(a) * sp; V[i * 3 + 1] = 7 + Math.random() * 4; V[i * 3 + 2] = o.nz * (2.2 + Math.random() * 2.4) + Math.sin(a) * sp;
        T0[i] = (Math.floor(i / origins.length) % 3) * 160 + (i % origins.length) * 60; ph[i] = Math.random() * 6.2832;
        col.set(cols[i % cols.length]); Cl[i * 3] = col.r; Cl[i * 3 + 1] = col.g; Cl[i * 3 + 2] = col.b;
        Sz[i] = 0.7 + Math.random() * 0.7; Al[i] = 0;
      }
      geo.setDrawRange(0, n); geo.attributes.color.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
      run = { t0: now, last: now, dur: 4200 }; pts.visible = true;
      return true;
    },
    step: function (now) {
      if (!run) return false;
      var s = now - run.t0, dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
      if (s >= run.dur) { run = null; pts.visible = false; return true; }
      var fade = 1 - sm((s - run.dur + 700) / 700);
      for (var i = 0; i < n; i++) {
        var t = s - T0[i]; if (t < 0) { Al[i] = 0; continue; }
        Al[i] = fade;
        var j = i * 3; if (P[j + 1] <= floor + 0.03 && V[j + 1] <= 0) { P[j + 1] = floor + 0.03; continue; } // lying on the grass
        V[j + 1] -= 9 * dt;
        var drag = V[j + 1] < 0 ? 0.9 : 0.985; V[j] *= Math.pow(drag, dt * 60); V[j + 2] *= Math.pow(drag, dt * 60);
        if (V[j + 1] < -1.6) V[j + 1] = -1.6; // paper: floats down
        var sway = V[j + 1] < 0 ? Math.sin(t / 1000 * 5 + ph[i]) * 0.9 : 0;
        P[j] += (V[j] + sway) * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += (V[j + 2] + sway * 0.5) * dt;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true;
      return true;
    },
    stop: function () { run = null; pts.visible = false; }
  };
}

// phone lights: spots [{x, y, z, d (delay ms)}]; they come on once and stay on until off()
export function makePhones(group, spots) {
  if (!spots.length) return null;
  var n = spots.length, pts = pointsOf(n, pointsMat({ size: 0.42, map: glow(), blending: THREE.AdditiveBlending, fog: false })), geo = pts.geometry; pts.name = 'crowd:phones';
  group.add(pts);
  var P = geo.attributes.position.array, Cl = geo.attributes.color.array, Sz = geo.attributes.aSize.array, Al = geo.attributes.aAlpha.array, run = null;
  for (var i = 0; i < n; i++) {
    var s = spots[i], w = 0.85 + Math.random() * 0.15; P[i * 3] = s.x; P[i * 3 + 1] = s.y; P[i * 3 + 2] = s.z;
    Cl[i * 3] = w; Cl[i * 3 + 1] = w; Cl[i * 3 + 2] = 1; Sz[i] = 0.75 + Math.random() * 0.5;
  }
  geo.attributes.position.needsUpdate = true;
  return {
    points: pts, on: function () { return pts.visible; },
    // place(fn): fn(k) -> {x, y, z} or null: move light k (to the phone in the raised hand)
    place: function (fn) { for (var k = 0; k < n; k++) { var q = fn(k); if (q) { P[k * 3] = q.x; P[k * 3 + 1] = q.y; P[k * 3 + 2] = q.z; } } geo.attributes.position.needsUpdate = true; },
    light: function (now, instant) {
      if (pts.visible) return false;
      for (var i = 0; i < n; i++) Al[i] = instant ? 1 : 0;
      geo.attributes.aAlpha.needsUpdate = true; pts.visible = true; run = instant ? null : { t0: now };
      return true;
    },
    step: function (now) {
      if (!run) return false;
      var s = now - run.t0, live = false;
      for (var i = 0; i < n; i++) { var k = sm((s - spots[i].d) / 450); Al[i] = k; if (k < 1) live = true; }
      geo.attributes.aAlpha.needsUpdate = true;
      if (!live) run = null;
      return true;
    },
    off: function () { run = null; pts.visible = false; }
  };
}
