// Shared building blocks for the extra venues (night stadium, beach, volcano).
// Everything is generated in code. Nothing here animates at rest: the crowd reactions (wave, clap, ooh,
// gasp, cheer, aw) and the camera flashes are one-shot effects driven by step(), which returns false again once they finish.
import * as THREE from 'three';

export function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function cvs(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function ctex(cv, aniso, rep) {
  var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso || 1;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
export function stdm(color, rough, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough == null ? 0.8 : rough, flatShading: true }, extra || {})); }
export function softTex() {
  var c = cvs(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return ctex(c, 1);
}
export function flashTex() {
  var c = cvs(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(31, 4, 2, 56); g.fillRect(4, 31, 56, 2);
  return ctex(c, 1);
}
export function glowSprite(tex, color, opacity, sx, sy) {
  var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(sx, sy || sx, 1); return s;
}

// Merge simple geometries into one (one draw call). parts: [{ geo, color, m (Matrix4, optional) }].
// The result always has position, normal and color (vertex colours); uv is kept when every part has one.
var _n3 = new THREE.Matrix3();
export function mergeGeos(parts) {
  var pos = [], nor = [], col = [], uv = [], hasUv = parts.every(function (p) { return !!p.geo.attributes.uv; }), c = new THREE.Color(), v = new THREE.Vector3();
  parts.forEach(function (p) {
    var g = p.geo.index ? p.geo.toNonIndexed() : p.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    if (!N) { g.computeVertexNormals(); N = g.attributes.normal; }
    c.set(p.color == null ? 0xffffff : p.color);
    if (p.m) _n3.getNormalMatrix(p.m);
    for (var i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); if (p.m) v.applyMatrix4(p.m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i); if (p.m) v.applyMatrix3(_n3).normalize(); nor.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
      if (hasUv) uv.push(U.getX(i), U.getY(i));
    }
    if (g !== p.geo) g.dispose();
    p.geo.dispose();
  });
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (hasUv) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
// Matrix4 from position, Euler rotation and (uniform or xyz) scale
export function mtx(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Sweep a stepped 2D profile ([u outward, y up] points) along a path of { x, z, nx, nz } (outward normals).
// Used for terraces that follow a U shape. Flat shaded, non-indexed.
// uvScale (optional): adds uv = (distance along the path / uvScale, profile index 0..1) for tiled textures.
export function sweep(profile, path, uvScale) {
  var pos = [], uv = [], np = profile.length - 1;
  function P(i, j) { var a = path[i], q = profile[j]; return [a.x + a.nx * q[0], q[1], a.z + a.nz * q[0]]; }
  function U(i, j) { return [(path[i].t || 0) * (path.len || 1) / (uvScale || 1), j / np]; }
  for (var i = 0; i < path.length - 1; i++) for (var j = 0; j < np; j++) {
    var a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    pos.push.apply(pos, a.concat(c, b, a, d, c));
    if (uvScale) uv.push.apply(uv, U(i, j).concat(U(i + 1, j + 1), U(i + 1, j), U(i, j), U(i, j + 1), U(i + 1, j + 1)));
  }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uvScale) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// A U-shaped path: straight back edge at z = zb from -hx..hx, rounded corners of radius r, sides running to z = zf.
// Outward normals point away from the pitch. step = spacing between points.
export function uPath(hx, zb, r, zf, step) {
  var pts = [], k;
  function push(x, z, nx, nz) { pts.push({ x: x, z: z, nx: nx, nz: nz }); }
  var sideL = zf - (zb + r), ns = Math.max(1, Math.round(sideL / step)), nb = Math.max(1, Math.round(2 * hx / step)), na = 8;
  for (k = 0; k <= ns; k++) push(-hx - r, zf - k * sideL / ns, -1, 0);                                   // left side, front to back
  for (k = 1; k < na; k++) { var a = Math.PI + k / na * Math.PI / 2; push(-hx + Math.cos(a) * r, zb + r + Math.sin(a) * r, Math.cos(a), Math.sin(a)); }
  for (k = 0; k <= nb; k++) push(-hx + k * 2 * hx / nb, zb, 0, -1);                                       // back edge
  for (k = 1; k < na; k++) { var b = 1.5 * Math.PI + k / na * Math.PI / 2; push(hx + Math.cos(b) * r, zb + r + Math.sin(b) * r, Math.cos(b), Math.sin(b)); }
  for (k = 0; k <= ns; k++) push(hx + r, zb + r + k * sideL / ns, 1, 0);                                  // right side, back to front
  // cumulative length 0..1 (used for the crowd wave)
  var L = 0; pts[0].t = 0;
  for (k = 1; k < pts.length; k++) { L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z); pts[k].t = L; }
  pts.forEach(function (p) { p.t /= L; });
  pts.len = L;
  return pts;
}
// Points spaced evenly along a path (for seats), with interpolated outward normals
export function alongPath(path, spacing, jitter, R) {
  var out = [], acc = spacing / 2;
  for (var i = 0; i < path.length - 1; i++) {
    var a = path[i], b = path[i + 1], seg = Math.hypot(b.x - a.x, b.z - a.z);
    while (acc < seg) {
      var f = acc / seg, nx = a.nx + (b.nx - a.nx) * f, nz = a.nz + (b.nz - a.nz) * f, nl = Math.hypot(nx, nz) || 1;
      out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, nx: nx / nl, nz: nz / nl, t: a.t + (b.t - a.t) * f });
      acc += spacing + (jitter ? (R() - 0.5) * jitter : 0);
    }
    acc -= seg;
  }
  return out;
}

// ----- Scoreboard text (palette per venue) -----
export function paintBoard(cv, text, pal) {
  var g = cv.getContext('2d'), w = cv.width, h = cv.height;
  var bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, pal.bg0); bg.addColorStop(1, pal.bg1); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (pal.rows) { g.fillStyle = pal.rows; for (var y = 0; y < h; y += 6) g.fillRect(0, y, w, 2); }
  var hb = Math.round(h * 0.17); g.fillStyle = pal.head; g.fillRect(0, 0, w, hb);
  g.font = '800 ' + Math.round(hb * 0.55) + 'px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = pal.headText; g.fillText(pal.title, w / 2, hb / 2 + 2);
  var lines = String(text == null || text === '' ? 'LET’S PLAY!' : text).split('\n').slice(0, 3), avail = h - hb - 24, lh, size = Math.min(210, Math.floor(avail / lines.length / 1.05));
  g.textBaseline = 'middle';
  for (;;) {
    g.font = '900 ' + size + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    var mx = 0; lines.forEach(function (l) { mx = Math.max(mx, g.measureText(l).width); });
    if (mx < w - 110 || size < 26) break; size -= 6;
  }
  lh = size * 1.05; var top = hb + (h - hb) / 2 - (lines.length - 1) * lh / 2;
  g.shadowColor = pal.glow; g.shadowBlur = 22; g.fillStyle = pal.text;
  lines.forEach(function (l, i) { g.fillText(l, w / 2, top + i * lh); });
  g.shadowBlur = 0; g.strokeStyle = pal.edge; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
}
// A screen on a casing. o = { w, h, pal, aniso, casing (material), glow (hex) }. Returns { group, setBoard }.
export function makeBoard(o) {
  var group = new THREE.Group(), cv = cvs(1024, Math.round(1024 * o.h / o.w)), tex = ctex(cv, o.aniso); paintBoard(cv, '', o.pal);
  var casing = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.7, o.h + 0.7, 0.5), o.casing); casing.position.z = -0.3; casing.castShadow = true; group.add(casing);
  var screen = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false })); group.add(screen);
  if (o.glow != null) { var gl = glowSprite(softTex(), o.glow, 0.2, o.w * 1.5, o.h * 1.7); gl.position.z = 0.2; group.add(gl); }
  return { group: group, setBoard: function (text) { paintBoard(cv, text, o.pal); tex.needsUpdate = true; } };
}

// ----- Instanced crowd: block people, see ../crowd.js (makeBlockCrowd) -----
export { makeBlockCrowd, HEAD_TOP } from '../crowd.js';

// ----- The venue API that table.js drives (same shape as the stadium's) -----
// o = { group, crowd (from makeBlockCrowd), pts, quality(), setBoard, flashColor, flashN }
export function venueApi(o) {
  var g = o.group, R = rng(99), fT = flashTex(), FN = o.flashN || 24, flashes = [];
  for (var q = 0; q < FN; q++) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fT, color: o.flashColor || 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.visible = false; sp.renderOrder = 4; g.add(sp); flashes.push({ sp: sp, t0: 0, dur: 0, sc: 1 });
  }
  var flashing = false, quality = o.quality || function () { return 2; }, pts = o.pts || [];
  return {
    group: g, legs: true, key: o.key || null,
    setBoard: o.setBoard || function () {},
    wave: function () { if (document.hidden || quality() < 1 || !o.crowd || !o.crowd.N) return false; return o.crowd.react('wave'); },
    // crowd reactions: 'clap' | 'ooh' | 'gasp' | 'cheer' | 'aw' (see ../crowd.js); also reachable as T3.crowd(kind, opts)
    crowd: function (kind, opts) { if (document.hidden || !o.crowd) return false; return o.crowd.react(kind, opts); },
    flash: function () {
      if (document.hidden || !pts.length) return false;
      var qq = quality(), n = qq >= 2 ? FN : qq === 1 ? Math.ceil(FN / 2) : 6, now = performance.now();
      for (var i = 0; i < FN; i++) {
        var f = flashes[i]; if (i >= n) { f.dur = 0; continue; }
        var p = pts[Math.floor(R() * pts.length)]; f.sp.position.set(p.x, p.y + 1.1, p.z); f.t0 = now + R() * 1300; f.dur = 200 + R() * 120; f.sp.visible = false; f.sp.material.opacity = 0; f.sc = 1.6 + R() * 1.4;
      }
      flashing = true; return true;
    },
    step: function (now) { // true while something is still moving
      var busy = !!(o.crowd && o.crowd.step(now));
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
      return busy;
    },
    dispose: function () { if (o.crowd) o.crowd.reset(); flashing = false; }
  };
}

// The venue's one main light (stage agent picks it up via userData.key for shadows).
// Shadows are left off here; the shadow camera already covers the table so turning them on just works.
export function keyLight(color, intensity, x, y, z, W, D) {
  var l = new THREE.DirectionalLight(color, intensity);
  l.position.set(x, y, z); l.userData.key = true; l.castShadow = false;
  var r = Math.max(W, D) / 2 + 4, sc = l.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = Math.hypot(x, y, z) + 30;
  l.shadow.bias = -0.0006; l.shadow.normalBias = 0.03;
  return l; // its target is the default (world origin = table centre)
}

// Venue layout numbers shared with the stadium so creatures and the camera fit the same way
export function venueLayout(W, D, layoutName) {
  var tall = layoutName === 'tall';
  return { tall: tall, lineZ: -D / 2 - (tall ? 2.0 : 3.4), boardW: tall ? 5.6 : 10.5, boardH: tall ? 2.5 : 3.4, boardX: tall ? -6.0 : 9.4 };
}
