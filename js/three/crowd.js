// Blocky crowd for the venues (stadium, night, beach, volcano): little block people with a cube head,
// a tapered box body (a bell-shaped jumper, no legs: they sit behind the row in front) and two short box
// arms. Original design: dot eyes, a hair cap, stubby arms; no studs, no claw hands, no pixel faces.
//
// Cheap on purpose: one InstancedMesh each for bodies, heads, hair, arms (2 per person) and any extras
// (sun hats, horns, monster faces), so 4-6 draw calls for the whole crowd. On the low quality tier the
// crowd is thinned by a third and has no arms.
//
// HARD RULE: nothing moves at rest. A reaction is a one-shot, 1.3-2.4 s long; while one runs step()
// returns true (the table keeps rendering), and when the last one ends every instance matrix is copied
// back from the rest pose, step() returns false and the crowd is completely still again.
//
// Reactions (T3.crowd(kind, opts) / venue.crowd(kind, opts)):
//   'clap'  a small section claps briefly          opts.at: 0..1 along the stands (left, round the back, right)
//   'ooh'   heads lean in, a few arms go up
//   'gasp'  a quick lean back, then still
//   'cheer' people hop with arms up                opts.wave: true also sends a wave round the stands
//   'aw'    a gentle slump (sympathetic, never mocking); 'aww' is accepted too
//   'wave'  the classic stadium wave (stand up, arms up, sit down), used by T3.fx('wave')
import * as THREE from 'three';

var NECK = 0.5, SH_X = 0.235, SH_Y = 0.45, REST_RAISE = 0.38, REST_ROLL = 0.1;
var DUR = { clap: 1500, ooh: 1800, gasp: 1300, cheer: 2400, aw: 2000, wave: 1700 };
var FRAC = { ooh: 0.8, gasp: 0.85, cheer: 0.85, aw: 0.75 };

// ----- geometry (non-indexed, vertex coloured; materials are flat shaded) -----
function merge(parts) {
  var pos = [], col = [], c = new THREE.Color();
  parts.forEach(function (p) {
    var g = p.geo.index ? p.geo.toNonIndexed() : p.geo, P = g.attributes.position;
    c.set(p.color == null ? 0xffffff : p.color);
    for (var i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); col.push(c.r, c.g, c.b); }
    if (g !== p.geo) g.dispose(); p.geo.dispose();
  });
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
function box(w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }
// body: 0.46 tall from y 0.04, narrower at the shoulders (a little bell / jumper shape)
export function bodyGeometry() {
  var g = box(0.44, 0.46, 0.28, 0, 0.27, 0), P = g.attributes.position;
  for (var i = 0; i < P.count; i++) if (P.getY(i) > 0.27) { P.setX(i, P.getX(i) * 0.82); P.setZ(i, P.getZ(i) * 0.9); }
  return merge([{ geo: g }]);
}
// head: a 0.34 cube sitting on the neck pivot (y = 0 here), face toward +z; optional dark dot eyes
export function headGeometry(eyes) {
  var parts = [{ geo: box(0.34, 0.34, 0.34, 0, 0.19, 0) }];
  if (eyes !== false) [-1, 1].forEach(function (s) { parts.push({ geo: box(0.05, 0.07, 0.02, s * 0.075, 0.21, 0.172), color: 0x15151c }); });
  return merge(parts);
}
// hair: a cap on top and a slab down the back of the head (same neck pivot)
export function hairGeometry() { return merge([{ geo: box(0.37, 0.08, 0.37, 0, 0.37, -0.005) }, { geo: box(0.37, 0.2, 0.06, 0, 0.27, -0.165) }]); }
// arm: hangs down from the shoulder pivot (y = 0 here)
export function armGeometry() { return merge([{ geo: box(0.11, 0.34, 0.12, 0, -0.15, 0) }]); }
// head top is at y 0.36 above the neck pivot (for hats, horns and the like)
export var HEAD_TOP = 0.36;

function sm(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
function env(s, a, r, dur) { return s <= 0 || s >= dur ? 0 : sm(s / a) * sm((dur - s) / r); }

// ----- affine helpers: 12 numbers, row-major [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz] -----
function mul(A, B, o) {
  for (var r = 0; r < 3; r++) {
    var a0 = A[r * 4], a1 = A[r * 4 + 1], a2 = A[r * 4 + 2];
    o[r * 4] = a0 * B[0] + a1 * B[4] + a2 * B[8];
    o[r * 4 + 1] = a0 * B[1] + a1 * B[5] + a2 * B[9];
    o[r * 4 + 2] = a0 * B[2] + a1 * B[6] + a2 * B[10];
    o[r * 4 + 3] = a0 * B[3] + a1 * B[7] + a2 * B[11] + A[r * 4 + 3];
  }
  return o;
}
// translate (tx, ty, tz) then rotate X by ax (a joint at an offset)
function jointX(tx, ty, tz, ax, o) {
  var c = Math.cos(ax), s = Math.sin(ax);
  o[0] = 1; o[1] = 0; o[2] = 0; o[3] = tx; o[4] = 0; o[5] = c; o[6] = -s; o[7] = ty; o[8] = 0; o[9] = s; o[10] = c; o[11] = tz;
  return o;
}
// shoulder joint: translate, then Ry(yaw) * Rz(roll) * Rx(-raise)
function shoulder(tx, ty, yaw, roll, raise, o) {
  var cy = Math.cos(yaw), sy = Math.sin(yaw), cz = Math.cos(roll), sz = Math.sin(roll), cx = Math.cos(-raise), sx = Math.sin(-raise);
  // Rz * Rx
  var m00 = cz, m01 = -sz * cx, m02 = sz * sx, m10 = sz, m11 = cz * cx, m12 = -cz * sx, m20 = 0, m21 = sx, m22 = cx;
  // Ry * (Rz * Rx)
  o[0] = cy * m00 + sy * m20; o[1] = cy * m01 + sy * m21; o[2] = cy * m02 + sy * m22; o[3] = tx;
  o[4] = m10; o[5] = m11; o[6] = m12; o[7] = ty;
  o[8] = -sy * m00 + cy * m20; o[9] = -sy * m01 + cy * m21; o[10] = -sy * m02 + cy * m22; o[11] = 0;
  return o;
}
function put(arr, slot, M) { // column-major 4x4 into an instanceMatrix array
  var o = slot * 16;
  arr[o] = M[0]; arr[o + 1] = M[4]; arr[o + 2] = M[8]; arr[o + 3] = 0;
  arr[o + 4] = M[1]; arr[o + 5] = M[5]; arr[o + 6] = M[9]; arr[o + 7] = 0;
  arr[o + 8] = M[2]; arr[o + 9] = M[6]; arr[o + 10] = M[10]; arr[o + 11] = 0;
  arr[o + 12] = M[3]; arr[o + 13] = M[7]; arr[o + 14] = M[11]; arr[o + 15] = 1;
}

// ----- the one crowd T3.crowd talks to (the venue that is on the table right now) -----
var current = null;
function install() {
  if (typeof window === 'undefined' || !window.T3 || window.T3.crowd) return;
  window.T3.crowd = function (kind, opts) {
    try {
      if (!current || (typeof document !== 'undefined' && document.hidden) || !current.attached()) return false;
      var ok = current.react(kind, opts || {});
      if (ok && window.T3.kick) window.T3.kick();
      return ok;
    } catch (e) { return false; }
  };
}
install();
// for headless checks and debugging: the crowd T3.crowd drives right now (or null)
export function currentCrowd() { return current; }

// pts: [{ x, y, z, ry, sc, key (0..1 along the stands), shirt, skin, hair (css colour or null), <extra fields> }]
// o: { quality(), arms (true), armCol ('shirt' | 'skin'), dim (colour multiplier, 1), eyes (true),
//      extras: [{ geo, mat, has: field name (person gets it if truthy), col: colour field or null }] }
// Returns { pts, N, meshes, react(kind, opts), step(now), reset(), busy() }.
export function makeBlockCrowd(group, pts, o) {
  o = o || {};
  var quality = o.quality || function () { return 2; }, q0 = quality(), dim = o.dim == null ? 1 : o.dim;
  if (q0 < 1) pts = pts.filter(function (p, i) { return i % 3 !== 2; }); // low tier: a third fewer people
  var N = pts.length, tc = new THREE.Color(), meshes = [];
  function inst(geo, mat, n) {
    var m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
    group.add(m); meshes.push(m); return m;
  }
  function mat(vc, rough) { return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, flatShading: true, vertexColors: !!vc }); }
  function colour(m, i, css) { m.setColorAt(i, tc.set(css).multiplyScalar(dim)); }
  // which people get hair / an extra: slot index per person (-1 = none)
  function slots(test) { var s = new Int32Array(N), k = 0; for (var i = 0; i < N; i++) s[i] = test(pts[i]) ? k++ : -1; s.count = k; return s; }

  var bodies = inst(bodyGeometry(), mat(true, 0.85), N), heads = inst(headGeometry(o.eyes), mat(true, 0.8), N);
  var hairS = slots(function (p) { return !!p.hair; }), hair = hairS.count ? inst(hairGeometry(), mat(true, 0.9), hairS.count) : null;
  var arms = (o.arms !== false && q0 >= 1 && N) ? inst(armGeometry(), mat(true, 0.85), 2 * N) : null;
  var extras = (o.extras || []).map(function (e) { var s = slots(function (p) { return !!p[e.has]; }); return { e: e, s: s, m: s.count ? inst(e.geo, e.mat, s.count) : null }; });
  var armField = o.armCol === 'skin' ? 'skin' : 'shirt';
  pts.forEach(function (p, i) {
    colour(bodies, i, p.shirt); colour(heads, i, p.skin);
    if (hair && hairS[i] >= 0) colour(hair, hairS[i], p.hair);
    if (arms) { colour(arms, 2 * i, p[armField]); colour(arms, 2 * i + 1, p[armField]); }
    extras.forEach(function (x) { if (x.m && x.e.col && x.s[i] >= 0) colour(x.m, x.s[i], p[x.e.col]); });
  });

  // base matrix per person: T(x, y, z) * Ry(ry) * scale
  var base = new Float32Array(12 * N), key = new Float32Array(N), rA = new Float32Array(N), rB = new Float32Array(N);
  pts.forEach(function (p, i) {
    var c = Math.cos(p.ry || 0), s = Math.sin(p.ry || 0), k = p.sc || 1, b = i * 12;
    base[b] = c * k; base[b + 1] = 0; base[b + 2] = s * k; base[b + 3] = p.x;
    base[b + 4] = 0; base[b + 5] = k; base[b + 6] = 0; base[b + 7] = p.y;
    base[b + 8] = -s * k; base[b + 9] = 0; base[b + 10] = c * k; base[b + 11] = p.z;
    key[i] = p.key || 0; rA[i] = Math.random(); rB[i] = Math.random();
  });

  // pose accumulators (added on top of the rest pose)
  var aDy = new Float32Array(N), aLean = new Float32Array(N), aHead = new Float32Array(N);
  var aRa0 = new Float32Array(N), aRa1 = new Float32Array(N), aRoll = new Float32Array(N), aYaw = new Float32Array(N);
  var P = new Array(12), Tm = new Array(12), J = new Array(12), H = new Array(12), A = new Array(12);
  function pose(i, dy, lean, hd, ra0, ra1, roll, yaw, withArms) {
    var b = i * 12;
    for (var k = 0; k < 12; k++) P[k] = base[b + k];
    P[7] += dy;
    var T = lean ? mul(P, jointX(0, 0, 0, lean, J), Tm) : P;
    put(bodies.instanceMatrix.array, i, T);
    mul(T, jointX(0, NECK, 0, hd, J), H);
    put(heads.instanceMatrix.array, i, H);
    if (hair && hairS[i] >= 0) put(hair.instanceMatrix.array, hairS[i], H);
    for (var x = 0; x < extras.length; x++) if (extras[x].m && extras[x].s[i] >= 0) put(extras[x].m.instanceMatrix.array, extras[x].s[i], H);
    if (arms && withArms) {
      // side 0 is local -x, side 1 is +x. roll is "outward", weighted by cos(raise) so raised arms make a V;
      // yaw is "inward" (toward the other hand, for clapping)
      var r0 = REST_RAISE + ra0, r1 = REST_RAISE + ra1;
      if (r0 > 3.0) r0 = 3.0; if (r1 > 3.0) r1 = 3.0;
      var ro = REST_ROLL + roll;
      mul(T, shoulder(-SH_X, SH_Y, yaw, -ro * Math.cos(r0), r0, J), A); put(arms.instanceMatrix.array, 2 * i, A);
      mul(T, shoulder(SH_X, SH_Y, -yaw, ro * Math.cos(r1), r1, J), A); put(arms.instanceMatrix.array, 2 * i + 1, A);
    }
  }
  for (var i0 = 0; i0 < N; i0++) pose(i0, 0, 0, 0, 0, 0, 0, 0, true);
  var rest = meshes.map(function (m) { return m.instanceMatrix.array.slice(); });
  function uploadAll() { meshes.forEach(function (m) { m.instanceMatrix.needsUpdate = true; }); }
  uploadAll();
  function restoreAll() { meshes.forEach(function (m, k) { m.instanceMatrix.array.set(rest[k]); m.instanceMatrix.needsUpdate = true; }); }
  function copySlot(m, k, slot) { var a = m.instanceMatrix.array, r = rest[k], o2 = slot * 16; for (var j = 0; j < 16; j++) a[o2 + j] = r[o2 + j]; }
  function restorePerson(i) {
    copySlot(bodies, 0, i); copySlot(heads, 1, i);
    meshes.forEach(function (m, k) {
      if (m === hair && hairS[i] >= 0) copySlot(m, k, hairS[i]);
      else if (m === arms) { copySlot(m, k, 2 * i); copySlot(m, k, 2 * i + 1); }
    });
    extras.forEach(function (x) { if (x.m && x.s[i] >= 0) copySlot(x.m, meshes.indexOf(x.m), x.s[i]); });
  }

  // ----- reactions -----
  var reacts = [], stamp = 1, mark = new Int32Array(N), cur = new Int32Array(N), prev = new Int32Array(N), nCur = 0, nPrev = 0, pending = false;
  function pick(kind, opts, low) {
    var list = [], i;
    if (kind === 'wave') { for (i = 0; i < N; i++) list.push(i); return list; }
    if (kind === 'clap') {
      var c = typeof opts.at === 'number' ? Math.max(0, Math.min(1, opts.at)) : 0.15 + Math.random() * 0.7, w = 0.13;
      for (i = 0; i < N; i++) if (Math.abs(key[i] - c) < w && Math.random() < (low ? 0.5 : 0.8)) list.push(i);
      return list;
    }
    var f = (FRAC[kind] || 0.8) * (low ? 0.6 : 1);
    for (i = 0; i < N; i++) if (Math.random() < f) list.push(i);
    return list;
  }
  // one person's contribution from one reaction at s ms since it started
  function add(r, i, s) {
    var u = rA[i], v = rB[i], e, t = s / 1000, dur = r.dur / 1000;
    switch (r.kind) {
      case 'clap': {
        var d = 0.15 * u, tt = t - d; e = env(tt, 0.2, 0.3, dur - 0.25); if (!e) return;
        aRa0[i] += (1.25 - REST_RAISE) * e; aRa1[i] += (1.25 - REST_RAISE) * e;
        aYaw[i] += (0.55 + 0.25 * Math.sin(6.2832 * 3.4 * tt + 6.2832 * v)) * e; aLean[i] += 0.04 * e; return;
      }
      case 'ooh': {
        e = env(t - 0.2 * u, 0.35, 0.6, dur - 0.2); if (!e) return;
        aLean[i] += 0.2 * e; aHead[i] += 0.14 * e;
        if (v < 0.25) { var ea = env(t - 0.25 - 0.2 * u, 0.3, 0.5, dur - 0.5); aRa1[i] += (2.5 - REST_RAISE) * ea; if (v < 0.12) aRa0[i] += (2.5 - REST_RAISE) * ea; aRoll[i] += 0.15 * ea; }
        return;
      }
      case 'gasp': {
        var tg = t - 0.06 * u; e = tg <= 0 ? 0 : sm(tg / 0.12) * (tg < 0.5 ? 1 : sm((dur - tg) / 0.75)); if (!e) return;
        aLean[i] -= 0.2 * e; aDy[i] += 0.03 * e; aHead[i] -= 0.06 * e;
        if (v < 0.25) { aRa0[i] += (1.0 - REST_RAISE) * e; aRa1[i] += (1.0 - REST_RAISE) * e; aYaw[i] += 0.2 * e; }
        return;
      }
      case 'cheer': {
        var tc2 = t - 0.15 * u; e = env(tc2, 0.25, 0.45, dur - 0.15); if (!e) return;
        var per = 0.36 + 0.12 * v; aDy[i] += 0.26 * Math.abs(Math.sin(Math.PI * tc2 / per)) * e;
        aRa0[i] += (2.75 - REST_RAISE) * e; aRa1[i] += (2.75 - REST_RAISE) * e; aRoll[i] += 0.3 * e; aLean[i] -= 0.04 * e; return;
      }
      case 'aw': {
        e = env(t - 0.2 * u, 0.5, 0.7, dur - 0.2); if (!e) return;
        aLean[i] += 0.1 * e; aHead[i] += 0.3 * e; aDy[i] -= 0.04 * e; aRa0[i] -= 0.15 * e; aRa1[i] -= 0.15 * e; return;
      }
      case 'wave': {
        var f = (s / r.dur) * 1.5 - 0.25, dd = (key[i] - f) / 0.15; if (dd <= -1 || dd >= 1) return;
        var up = 0.5 * (1 + Math.cos(Math.PI * dd));
        aDy[i] += 0.75 * up; aRa0[i] += (2.8 - REST_RAISE) * up; aRa1[i] += (2.8 - REST_RAISE) * up; aRoll[i] += 0.25 * up; return;
      }
    }
  }
  var api = {
    pts: pts, N: N, meshes: meshes,
    group: group,
    attached: function () { var p = group; while (p.parent) p = p.parent; return !!p.isScene; },
    busy: function () { return reacts.length > 0 || pending; },
    // returns true if a reaction started (or the same one is already under way)
    react: function (kind, opts) {
      if (!N) return false;
      kind = kind === 'aww' ? 'aw' : String(kind || '');
      if (!DUR[kind]) return false;
      opts = opts || {};
      var now = performance.now(), low = quality() < 1;
      if (arms) arms.visible = !low;
      for (var k = 0; k < reacts.length; k++) if (reacts[k].kind === kind && now - reacts[k].t0 < 400) return true; // no stacking up
      var list = pick(kind, opts, low); if (!list.length) return false;
      if (reacts.length >= 4) reacts.shift();
      reacts.push({ kind: kind, t0: now, dur: DUR[kind], idx: list });
      if (kind === 'cheer' && opts.wave && !low) reacts.push({ kind: 'wave', t0: now + 250, dur: DUR.wave, idx: pick('wave', opts, low) });
      return true;
    },
    // true while something moved this frame (the table keeps rendering); false once everyone is still
    step: function (now) {
      if (!reacts.length) { if (pending) { pending = false; restoreAll(); return true; } return false; }
      stamp++; nCur = 0;
      var withArms = !!arms && arms.visible, live = [], r, j, i, s;
      for (var k = 0; k < reacts.length; k++) {
        r = reacts[k]; s = now - r.t0;
        if (s >= r.dur) continue;
        live.push(r);
        if (s < 0) continue;
        for (j = 0; j < r.idx.length; j++) {
          i = r.idx[j];
          if (mark[i] !== stamp) { mark[i] = stamp; cur[nCur++] = i; aDy[i] = aLean[i] = aHead[i] = aRa0[i] = aRa1[i] = aRoll[i] = aYaw[i] = 0; }
          add(r, i, s);
        }
      }
      reacts = live;
      for (j = 0; j < nCur; j++) { i = cur[j]; pose(i, aDy[i], aLean[i], aHead[i], aRa0[i], aRa1[i], aRoll[i], aYaw[i], withArms); }
      for (j = 0; j < nPrev; j++) { i = prev[j]; if (mark[i] !== stamp) restorePerson(i); }
      var sw = prev; prev = cur; cur = sw; nPrev = nCur;
      if (!reacts.length) { restoreAll(); nPrev = 0; pending = false; return true; } // exactly the rest pose: completely still
      uploadAll(); pending = true;
      return true;
    },
    reset: function () { reacts = []; nPrev = 0; pending = false; restoreAll(); if (current === api) current = null; }
  };
  current = api; install();
  return api;
}
