// One-shot 3D effects for the table: confetti cannons and the spotlight.
// Nothing here runs unless an effect is playing; step() returns true while it needs frames.
import * as THREE from 'three';
import { FLOOR_Y, softTexture } from './environment.js';

var PALETTE = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b', '#ffffff', '#ff922b', '#da77f2'];

// c = { scene, layout(), quality(), dim(k), cubePos(id), dirty(), startLoop() }
export function createFx3d(c) {
  var conf = null, cannons = null, spot = null;

  // ----- Confetti -----
  function surfaceY(x, z, W, D) {
    var ax = Math.abs(x), az = Math.abs(z);
    if (ax < W / 2 + 0.2 && az < D / 2 + 0.2) return 0.04;   // on the felt
    if (ax < W / 2 + 0.75 && az < D / 2 + 0.75) return 0.66; // on the rim
    return FLOOR_Y + 0.04;                                   // down on the ground
  }
  function ensureConfetti(n) {
    if (conf && conf.n >= n) return;
    if (conf) { c.scene.remove(conf.mesh); conf.mesh.geometry.dispose(); conf.mesh.material.dispose(); conf.mesh.dispose(); }
    var geo = new THREE.PlaneGeometry(0.46, 0.27), mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, fog: false }), mesh = new THREE.InstancedMesh(geo, mat, n), col = new THREE.Color();
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 6;
    for (var i = 0; i < n; i++) mesh.setColorAt(i, col.set(PALETTE[i % PALETTE.length]));
    c.scene.add(mesh);
    conf = { mesh: mesh, n: n, p: [], active: false };
    for (var k = 0; k < n; k++) conf.p.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, ph: 0, done: false, sc: 1 });
  }
  function ensureCannons() {
    if (cannons) return;
    cannons = new THREE.Group(); cannons.visible = false;
    [[0xff6b6b, -1], [0x4dabf7, 1]].forEach(function (d) {
      var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.7, 14), new THREE.MeshStandardMaterial({ color: d[0], roughness: 0.4, metalness: 0.2 }));
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.08, 8, 16), new THREE.MeshStandardMaterial({ color: 0xffd43b, metalness: 0.6, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.85; barrel.add(ring);
      var g = new THREE.Group(); g.add(barrel); g.userData.side = d[1]; cannons.add(g);
    });
    c.scene.add(cannons);
  }
  function confetti(opts) {
    var L = c.layout(); if (!L || document.hidden) return false;
    var q = c.quality(), n = q >= 2 ? 220 : q === 1 ? 110 : 45; if (opts && opts.n) n = Math.min(n, opts.n);
    ensureConfetti(n); ensureCannons();
    var W = L.W, D = L.D, now = performance.now(), zc = c.layoutName() === 'tall' ? -2 : -1;
    conf.t0 = now; conf.last = 0; conf.active = true; conf.cnt = n; conf.fade = 0;
    var half = n >> 1;
    conf.p.forEach(function (p, i) {
      if (i >= n) return;
      var side = i < half ? -1 : 1, e = (0.95 + Math.random() * 0.45), sp = 8.5 + Math.random() * 5, a = (0.3 + Math.random() * 0.16) * Math.PI; // 54..82 deg up
      p.x = side * (W / 2 + 1.6); p.y = 1.3; p.z = zc + (Math.random() - 0.5) * 1.2;
      var spread = (Math.random() - 0.5) * 0.7;
      var dist = W / 2 + 1.6; p.vx = -side * dist * (0.25 + 0.65 * Math.random()) * 0.9; p.vy = Math.sin(a) * sp * e; p.vz = spread * dist * 0.55 * 0.9;
      p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.rz = Math.random() * 6; p.wx = (Math.random() - 0.5) * 16; p.wy = (Math.random() - 0.5) * 16; p.wz = (Math.random() - 0.5) * 12;
      p.ph = Math.random() * 6.28; p.done = false; p.sc = 0.8 + Math.random() * 0.6; p.delay = Math.random() * 0.12 + (i % 2 ? 0.06 : 0); p.live = false;
    });
    cannons.children.forEach(function (g) { var s = g.userData.side; g.position.set(s * (W / 2 + 1.4), 0.5, zc); g.rotation.set(0, 0, s * 0.95); g.userData.rec = 1; });
    cannons.visible = true; conf.mesh.visible = true; conf.mesh.count = n;
    c.dirty(); c.startLoop(); return true;
  }
  var tmpO = new THREE.Object3D();
  function stepConfetti(now, dt) {
    if (!conf || !conf.active) return false;
    var L = c.layout(), W = L.W, D = L.D, t = (now - conf.t0) / 1000, left = 0, k = Math.exp(-1.7 * dt), kh = Math.exp(-0.9 * dt), M = conf.mesh;
    cannons.children.forEach(function (g) { var r = Math.max(0, 1 - t * 5); g.scale.set(1, 1 - 0.16 * r, 1); });
    if (t > 0.5) cannons.visible = false;
    for (var i = 0; i < conf.cnt; i++) {
      var p = conf.p[i];
      if (!p.done) {
        if (!p.live) { if (t < p.delay) { left++; tmpO.position.set(0, -50, 0); tmpO.scale.setScalar(0.0001); tmpO.updateMatrix(); M.setMatrixAt(i, tmpO.matrix); continue; } p.live = true; }
        p.vx *= kh; p.vz *= kh; p.vy = (p.vy - 4.2 * dt) * k; p.vx += Math.sin(t * 5 + p.ph) * 0.9 * dt; p.vz += Math.cos(t * 4 + p.ph) * 0.9 * dt;
        if (p.vy < -2.6) p.vy = -2.6;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        var gy = surfaceY(p.x, p.z, W, D);
        if (p.y <= gy && p.vy < 0) { p.y = gy; p.done = true; p.rx = -Math.PI / 2; p.ry = 0; }
        else left++;
      }
      tmpO.position.set(p.x, p.y, p.z); tmpO.rotation.set(p.rx, p.ry, p.rz); var fs = p.sc * (conf.fade ? Math.max(0, 1 - (now - conf.fade) / 500) : 1); tmpO.scale.setScalar(fs); tmpO.updateMatrix(); M.setMatrixAt(i, tmpO.matrix);
    }
    M.instanceMatrix.needsUpdate = true;
    if (!left && !conf.last) conf.last = now;
    if (!conf.fade && ((conf.last && now - conf.last > 1800) || t > 6)) conf.fade = now;
    if (conf.fade && now - conf.fade > 520) { conf.active = false; M.visible = false; cannons.visible = false; return false; }
    return true;
  }

  // ----- Spotlight: a soft beam, a pool of light, and a brief dimming of the room -----
  function ensureSpot() {
    if (spot) return;
    var cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; var g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,248,214,0)'); gr.addColorStop(1, 'rgba(255,248,214,.9)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
    var bt = new THREE.CanvasTexture(cv); bt.colorSpace = THREE.SRGBColorSpace;
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1, 1, 28, 1, true), new THREE.MeshBasicMaterial({ map: bt, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    var pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTexture(), color: 0xfff1c0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    pool.rotation.x = -Math.PI / 2; beam.renderOrder = 2; pool.renderOrder = 2; beam.visible = pool.visible = false;
    c.scene.add(beam); c.scene.add(pool); spot = { beam: beam, pool: pool, active: false };
  }
  function spotlight(opts) {
    var L = c.layout(); if (!L || document.hidden) return false; opts = opts || {};
    var cx, cz, rw, rd;
    if (opts.cube != null) { var p = c.cubePos(opts.cube); if (!p) return false; cx = p.x; cz = p.z; rw = rd = 2.4; }
    else if (opts.zone && L.z[opts.zone]) { var r = L.z[opts.zone]; cx = r[0] + r[2] / 2; cz = r[1] + r[3] / 2; rw = r[2] * 0.8; rd = r[3] * 0.8; }
    else return false;
    ensureSpot();
    var H = 15, rad = Math.max(rw, rd) * 0.5;
    var br = Math.min(rad * 0.9, 2.6); spot.beam.scale.set(br, H, br); spot.beam.position.set(cx, H / 2, cz);
    spot.pool.scale.set(rw * 1.25, rd * 1.25, 1); spot.pool.position.set(cx, 0.05, cz);
    spot.t0 = performance.now(); spot.dur = opts.dur || 1500; spot.active = true; spot.beam.visible = spot.pool.visible = true;
    c.dirty(); c.startLoop(); return true;
  }
  function stepSpot(now) {
    if (!spot || !spot.active) return false;
    var k = (now - spot.t0) / spot.dur, a = k >= 1 ? 0 : Math.min(ease(k / 0.18), ease((1 - k) / 0.3));
    spot.beam.material.opacity = 0.34 * a; spot.pool.material.opacity = 0.55 * a; c.dim(1 - 0.38 * a);
    if (k >= 1) { spot.active = false; spot.beam.visible = spot.pool.visible = false; c.dim(1); return false; }
    return true;
  }
  function ease(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }

  return {
    confetti: confetti, spotlight: spotlight,
    step: function (now, dt) { var a = stepConfetti(now, dt), b = stepSpot(now); return a || b; },
    reset: function () { // theme/layout rebuilt: drop any running effect
      if (conf) { conf.active = false; conf.mesh.visible = false; } if (cannons) cannons.visible = false;
      if (spot && spot.active) { spot.active = false; spot.beam.visible = spot.pool.visible = false; c.dim(1); }
    }
  };
}
